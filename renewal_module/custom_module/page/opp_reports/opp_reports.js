// Copyright (c) 2026, 64 Network Security Pvt. Ltd.
// Opportunity Reports — custom desk page `opp-reports` (or- prefix).
//
// Place at: <your_app>/<your_app>/page/opp_reports/opp_reports.js
// Set API below to your server module path.

frappe.pages['opp-reports'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: 'Opportunity reports', single_column: true });
	new OppReportsPage(page, wrapper);
};

// >>> set this to "<your_app>.api.opp_reports"
const OR_API = 'renewal_module.custom_module.page.opp_reports.opp_reports';

class OppReportsPage {
	constructor(page, wrapper) {
		this.page = page;
		this.$body = $(wrapper).find('.layout-main-section');
		this.scope = 'My';
		this.active = 'pipeline_overview';
		this.chartObj = null;
		this._inject_assets();
		this._scaffold();
		this._load_meta();
	}

	_inject_assets() {
		if (!document.getElementById('or-fonts')) {
			const l = document.createElement('link');
			l.id = 'or-fonts'; l.rel = 'stylesheet';
			l.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=DM+Sans:wght@400;500&display=swap';
			document.head.appendChild(l);
		}
		if (!document.getElementById('or-tabler')) {
			const t = document.createElement('link');
			t.id = 'or-tabler'; t.rel = 'stylesheet';
			t.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.30.0/tabler-icons.min.css';
			document.head.appendChild(t);
		}
		if (document.getElementById('or-styles')) return;
		const css = `
		.or-wrap{font-family:'DM Sans',sans-serif;color:#1f2330;--or-accent:#2f4de0;--or-line:#e6e8ef;}
		.or-wrap h1,.or-wrap h2,.or-wrap h3{font-family:'Syne',sans-serif;}
		.or-toolbar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end;background:#f6f7fb;border:1px solid var(--or-line);border-radius:10px;padding:10px 12px;margin-bottom:14px;}
		.or-field{display:flex;flex-direction:column;gap:2px;}
		.or-field label{font-size:11px;color:#6b7280;line-height:1.2;}
		.or-field input,.or-field select{height:30px;border:1px solid var(--or-line);border-radius:7px;padding:0 8px;font-size:13px;background:#fff;}
		.or-scope{display:inline-flex;border:1px solid var(--or-line);border-radius:8px;overflow:hidden;}
		.or-scope button{border:none;background:#fff;padding:7px 14px;font-size:13px;color:#6b7280;cursor:pointer;border-right:1px solid var(--or-line);font-family:'DM Sans',sans-serif;}
		.or-scope button:last-child{border-right:none;}
		.or-scope button.active{background:#ecefff;color:var(--or-accent);font-weight:500;}
		.or-fc{display:inline-flex;border:1px solid var(--or-line);border-radius:7px;overflow:hidden;height:30px;}
		.or-fc button{border:none;background:#fff;padding:0 12px;font-size:13px;color:#6b7280;cursor:pointer;border-right:1px solid var(--or-line);font-family:'DM Sans',sans-serif;}
		.or-fc button:last-child{border-right:none;}
		.or-fc button.active{background:#ecefff;color:var(--or-accent);font-weight:500;}
		.or-mc .frappe-control{margin:0 !important;}
		.or-mc .form-group{margin:0 !important;}
		.or-mc .control-label{display:none !important;}
		.or-mc .help-box,.or-mc .clearfix{display:none !important;}
		.or-mc .control-input-wrapper{margin-top:0 !important;}
		.or-mc .control-input{margin-top:0 !important;}
		.or-mcf{width:150px;flex:0 0 150px;}
		.or-mcf .or-mc{position:relative;}
		.or-mcf .or-count{position:absolute;top:-16px;right:0;font-size:10px;color:var(--or-accent);font-weight:500;}
		.or-toolbar .or-field select,.or-toolbar .or-field input[type=date]{max-width:140px;}
		.or-tabs{display:flex;flex-wrap:wrap;gap:2px;border-bottom:1px solid var(--or-line);margin-bottom:16px;}
		.or-tab{display:flex;align-items:center;gap:7px;padding:9px 14px;font-size:13px;cursor:pointer;color:#6b7280;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;}
		.or-tab:hover{color:#3a3f4c;}
		.or-tab.active{color:var(--or-accent);font-weight:500;border-bottom-color:var(--or-accent);}
		.or-tab i{font-size:16px;}
		.or-content{min-width:0;}
		.or-title{font-size:19px;font-weight:600;margin:0 0 16px;display:flex;align-items:center;gap:10px;color:#1f2330;}
		.or-title .or-title-ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#ecefff;color:var(--or-accent);font-size:19px;}
		.or-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px;}
		.or-card{position:relative;border-radius:11px;padding:14px 16px;overflow:hidden;border:1px solid transparent;}
		.or-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;}
		.or-card .l{font-size:12px;color:#6b7280;margin-bottom:7px;}
		.or-card .v{font-size:24px;font-weight:600;font-family:'Syne',sans-serif;line-height:1;}
		.or-card.blue{background:#eef1ff;border-color:#dbe1ff;}   .or-card.blue::before{background:#2f4de0;}   .or-card.blue .v{color:#2f4de0;}
		.or-card.green{background:#e9f8ef;border-color:#cdeed9;}  .or-card.green::before{background:#16a34a;}  .or-card.green .v{color:#15803d;}
		.or-card.orange{background:#fdf1e6;border-color:#f7ddc2;} .or-card.orange::before{background:#ea8a23;} .or-card.orange .v{color:#c2620a;}
		.or-card.yellow{background:#fdf8e3;border-color:#f3e9b8;} .or-card.yellow::before{background:#d9a814;} .or-card.yellow .v{color:#a17d0c;}
		.or-card.red{background:#fdecec;border-color:#f6d0d0;}    .or-card.red::before{background:#dc2626;}    .or-card.red .v{color:#b91c1c;}
		.or-card.gray{background:#f4f5f8;border-color:#e6e8ef;}   .or-card.gray::before{background:#9aa0ad;}   .or-card.gray .v{color:#3a3f4c;}
		.or-chartbox{background:#fff;border:1px solid var(--or-line);border-radius:12px;padding:14px 16px 6px;margin-bottom:18px;}
		.or-tablewrap{overflow-x:auto;border:1px solid var(--or-line);border-radius:12px;}
		.or-table{width:100%;border-collapse:collapse;font-size:13px;min-width:560px;}
		.or-table th{text-align:left;padding:11px 13px;font-weight:500;color:#445;background:#eef1ff;white-space:nowrap;border-bottom:1px solid #dbe1ff;}
		.or-table td{padding:10px 13px;border-top:1px solid var(--or-line);white-space:nowrap;}
		.or-table tbody tr:nth-child(even){background:#fafbfe;}
		.or-table tbody tr:hover{background:#f3f4ff;}
		.or-table td.r,.or-table th.r{text-align:right;}
		.or-table a{color:var(--or-accent);text-decoration:none;font-weight:500;}
		.or-cellcard{line-height:1.45;white-space:normal;}
		.or-cellcard a{font-weight:600;}
		.or-cellcard .or-sub{font-size:12px;color:#5a6072;font-weight:400;}
		.or-cellcard .or-cust{max-width:270px;}
		.or-metaline{display:flex;flex-wrap:wrap;gap:10px;margin-top:3px;}
		.or-metaline span{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#8a90a0;}
		.or-metaline i{font-size:13px;}
		.or-chips2{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;}
		.or-chip2{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;line-height:1.5;}
		.or-chip2 i{font-size:12px;}
		.or-chip2.c-brand{background:#eef1ff;color:#2f4de0;}
		.or-chip2.c-stage{background:#e9f8ef;color:#15803d;}
		.or-chip2.c-type{background:#f5edff;color:#7e22ce;}
		.or-chip2.c-exp{background:#fdf1e6;color:#c2620a;}
		.or-empty{padding:40px;text-align:center;color:#9aa0ad;font-size:13px;}
		`;
		const s = document.createElement('style'); s.id = 'or-styles'; s.textContent = css;
		document.head.appendChild(s);
	}

	_scaffold() {
		this.$body.html(`
			<div class="or-wrap">
				<div class="or-scope-row" style="margin-bottom:12px;">
					<div class="or-field"><label>Scope</label><div class="or-scope"></div></div>
				</div>
				<div class="or-toolbar">
					<div class="or-field or-mcf"><label>Sales person</label><div class="or-mc" data-kind="sales_person"></div></div>
					<div class="or-field or-mcf"><label>Company</label><div class="or-mc" data-kind="company"></div></div>
					<div class="or-field or-mcf"><label>Customer</label><div class="or-mc" data-kind="party_name"></div></div>
					<div class="or-field or-mcf"><label>Brand</label><div class="or-mc" data-kind="brand"></div></div>
					<div class="or-field or-mcf"><label>Sales stage</label><div class="or-mc" data-kind="sales_stage"></div></div>
					<div class="or-field"><label>Timespan</label><select class="or-f-span"></select></div>
					<div class="or-field or-custom-from" style="display:none;"><label>From (closing)</label><input type="date" class="or-f-from"></div>
					<div class="or-field or-custom-to" style="display:none;"><label>To (closing)</label><input type="date" class="or-f-to"></div>
					<div class="or-field"><label>Forecast</label>
						<div class="or-fc">
							<button data-fc="" class="active">Both</button>
							<button data-fc="Include">Include</button>
							<button data-fc="Exclude">Exclude</button>
						</div>
					</div>
					<div class="or-field" style="justify-content:flex-end;"><button class="btn btn-primary btn-sm or-run">Run</button></div>
				</div>
				<div class="or-tabs"></div>
				<div class="or-content"><div class="or-empty">Loading…</div></div>
			</div>`);

		this.selected = { sales_person: [], company: [], party_name: [], brand: [], sales_stage: [] };

		this.$body.find('.or-run').on('click', () => this._render_active());

		// timespan presets
		const span = this.$body.find('.or-f-span');
		const presets = [
			['', 'All time'],
			['this_week', 'This week'], ['last_week', 'Last week'], ['next_week', 'Next week'],
			['this_month', 'This month'], ['last_month', 'Last month'], ['next_month', 'Next month'],
			['this_quarter', 'This quarter'], ['last_quarter', 'Last quarter'], ['next_quarter', 'Next quarter'],
			['this_year', 'This year'], ['last_year', 'Last year'], ['next_year', 'Next year'],
			['custom', 'Custom…'],
		];
		presets.forEach(([v, l]) => span.append(`<option value="${v}">${l}</option>`));
		span.on('change', () => {
			const custom = span.val() === 'custom';
			this.$body.find('.or-custom-from, .or-custom-to').toggle(custom);
		});

		// forecast three-state toggle
		const fc = this.$body.find('.or-fc');
		fc.find('button').on('click', (e) => {
			fc.find('button').removeClass('active');
			$(e.currentTarget).addClass('active');
			this.forecast = $(e.currentTarget).data('fc');
		});
		this.forecast = '';
		this.controls = {};

		// Sales stage options come from get_meta; the rest search server-side.
		this._stage_options = [];
		this._build_multiselects();
	}

	_build_multiselects() {
		const self = this;
		this.$body.find('.or-mc').each(function () {
			const kind = $(this).data('kind');
			const get_data = (kind === 'sales_stage')
				? (txt) => (self._stage_options || [])
					.filter((v) => !txt || v.toLowerCase().includes(txt.toLowerCase()))
					.map((v) => ({ value: v, description: '' }))
				: (txt) => frappe.call({
						method: `${OR_API}.search_options`,
						args: { kind, txt: txt || '' },
					}).then((r) => (r.message || []).map((o) => ({
						value: o.value,
						label: o.label,
						description: (o.description && o.description !== o.value) ? o.description : '',
					})));

			self.controls[kind] = frappe.ui.form.make_control({
				parent: this,
				df: {
					fieldtype: 'MultiSelectList',
					fieldname: kind,
					placeholder: __('Search…'),
					get_data,
				},
				render_input: true,
			});
			self.controls[kind].$input_area && self.controls[kind].$input_area.css('min-width', '130px');
			$(this).append('<span class="or-count" data-kind="' + kind + '"></span>');
		});
		this.$body.find('.or-toolbar').on('click input keyup', () => this._refresh_counts());
	}

	_refresh_counts() {
		const self = this;
		this.$body.find('.or-count').each(function () {
			const n = self._vals($(this).data('kind')).length;
			$(this).text(n ? `${n} selected` : '');
		});
	}

	_load_meta() {
		frappe.call({ method: `${OR_API}.get_meta` }).then((r) => {
			const m = r.message || {};
			this._catalogue = m.catalogue || [];
			this._build_scope(m.scopes || ['My']);
			this._build_stages(m.sales_stages || []);
			this._build_rail(m.catalogue || []);
			this._render_active();
		});
	}

	_build_scope(scopes) {
		const wrap = this.$body.find('.or-scope').empty();
		const icons = { 'My': 'ti-user', 'My Team': 'ti-users', 'Organization': 'ti-building' };
		scopes.forEach((s) => {
			const b = $(`<button data-scope="${s}"><i class="ti ${icons[s] || 'ti-user'}"></i> ${s}</button>`);
			if (s === this.scope) b.addClass('active');
			b.on('click', () => { this.scope = s; wrap.find('button').removeClass('active'); b.addClass('active'); this._render_active(); });
			wrap.append(b);
		});
		if (!scopes.includes(this.scope)) this.scope = scopes[0];
	}

	_build_rail(catalogue) {
		const tabs = this.$body.find('.or-tabs').empty();
		catalogue.forEach((c) => {
			const tab = $(`<div class="or-tab" data-key="${c.key}"><i class="ti ${c.icon}"></i><span>${frappe.utils.escape_html(c.label)}</span></div>`);
			if (c.key === this.active) tab.addClass('active');
			tab.on('click', () => {
				this.active = c.key;
				tabs.find('.or-tab').removeClass('active');
				tab.addClass('active');
				this._render_active();
			});
			tabs.append(tab);
		});
	}

	_build_stages(stages) {
		// feed the sales_stage MultiSelectList its option list
		this._stage_options = stages || [];
	}

	_vals(kind) {
		const c = this.controls && this.controls[kind];
		if (!c) return [];
		if (Array.isArray(c.selected_values)) return c.selected_values.slice();
		if (typeof c.get_values === 'function') {
			const v = c.get_values();
			return Array.isArray(v) ? v : [];
		}
		if (typeof c.get_value === 'function') {
			const v = c.get_value();
			if (Array.isArray(v)) return v;
			if (typeof v === 'string' && v) return v.split(',').map((x) => x.trim()).filter(Boolean);
		}
		return [];
	}

	_filters() {
		return {
			sales_person: this._vals('sales_person'),
			company: this._vals('company'),
			party_name: this._vals('party_name'),
			brand: this._vals('brand'),
			sales_stage: this._vals('sales_stage'),
			timespan: this.$body.find('.or-f-span').val(),
			from_date: this.$body.find('.or-f-from').val(),
			to_date: this.$body.find('.or-f-to').val(),
			forecast: this.forecast || '',
		};
	}

	_render_active() {
		const content = this.$body.find('.or-content').html('<div class="or-empty">Loading…</div>');
		frappe.call({
			method: `${OR_API}.get_report`,
			args: { report: this.active, scope: this.scope, filters: JSON.stringify(this._filters()) },
		}).then((r) => this._render(content, r.message || {}))
		  .catch(() => content.html('<div class="or-empty">Could not load this report.</div>'));
	}

	// ---- the single generic renderer used by all 11 reports ----
	_render(content, payload) {
		content.empty();
		const cat = (this._catalogue || []).find((c) => c.key === this.active);
		const icon = cat ? cat.icon : 'ti-chart-bar';
		content.append(`<h2 class="or-title"><span class="or-title-ic"><i class="ti ${icon}"></i></span>${frappe.utils.escape_html(this._active_label())}</h2>`);

		// cards
		if (payload.summary && payload.summary.length) {
			const grid = $('<div class="or-cards"></div>');
			payload.summary.forEach((c) => {
				grid.append(`<div class="or-card ${c.indicator || ''}">
					<div class="l">${frappe.utils.escape_html(c.label)}</div>
					<div class="v">${this._fmt(c.value, c.datatype)}</div></div>`);
			});
			content.append(grid);
		}

		// chart
		if (payload.chart && payload.chart.labels && payload.chart.labels.length) {
			const box = $('<div class="or-chartbox"></div>');
			content.append(box);
			try {
				this.chartObj = new frappe.Chart(box.get(0), {
					data: { labels: payload.chart.labels, datasets: payload.chart.datasets },
					type: payload.chart.type || 'bar',
					height: 250,
					colors: ['#2f4de0', '#16a34a', '#ea8a23', '#9333ea', '#dc2626', '#0ea5b7'],
					axisOptions: { xIsSeries: false },
					barOptions: { spaceRatio: 0.4 },
				});
			} catch (e) { box.remove(); }
		}

		// table
		if (payload.columns && payload.columns.length) {
			const wrap = $('<div class="or-tablewrap"></div>');
			const t = $('<table class="or-table"></table>');
			const head = payload.columns.map((c) =>
				`<th class="${this._isnum(c) ? 'r' : ''}">${frappe.utils.escape_html(c.label)}</th>`).join('');
			t.append(`<thead><tr>${head}</tr></thead>`);
			const tb = $('<tbody></tbody>');
			(payload.rows || []).forEach((row) => {
				const tds = payload.columns.map((c) => {
					const cls = this._isnum(c) ? 'r' : '';
					return `<td class="${cls}">${this._cell(row[c.fieldname], c, row)}</td>`;
				}).join('');
				tb.append(`<tr>${tds}</tr>`);
			});
			t.append(tb); wrap.append(t); content.append(wrap);
		}

		if ((!payload.rows || !payload.rows.length) && (!payload.summary || !payload.summary.length)) {
			content.append('<div class="or-empty">No data for the selected filters.</div>');
		}
	}

	_active_label() {
		const found = (this._catalogue || []).find((c) => c.key === this.active);
		return found ? found.label : 'Report';
	}

	_isnum(col) {
		return ['Currency', 'Int', 'Float', 'Percent'].includes(col.fieldtype) || col.align === 'right';
	}

	_cell(val, col, row) {
		if (col.fieldtype === 'OppParty') {
			const id = row && row.opportunity;
			if (!id) return '<span style="color:#c2c5cd;">—</span>';
			const link = `<a href="/app/opportunity/${encodeURIComponent(id)}">${frappe.utils.escape_html(id)}</a>`;
			const cust = row.customer ? `<div class="or-sub or-cust">${frappe.utils.escape_html(row.customer)}</div>` : '';
			const created = row.creation ? frappe.datetime.str_to_user((row.creation + '').split(' ')[0]) : '';
			const meta = [];
			if (created) meta.push(`<span><i class="ti ti-calendar-event"></i>${created}</span>`);
			if (row.sales_person) meta.push(`<span><i class="ti ti-user"></i>${frappe.utils.escape_html(row.sales_person)}</span>`);
			const metaLine = meta.length ? `<div class="or-metaline">${meta.join('')}</div>` : '';
			return `<div class="or-cellcard">${link}${cust}${metaLine}</div>`;
		}
		if (col.fieldtype === 'ItemMeta') {
			const code = row && row.item_code;
			const top = code
				? `<a href="/app/item/${encodeURIComponent(code)}">${frappe.utils.escape_html(code)}</a>`
				: '<span style="color:#c2c5cd;">—</span>';
			const name = row.item_name ? `<div class="or-sub">${frappe.utils.escape_html(row.item_name)}</div>` : '';
			const chips = [];
			if (row.brand) chips.push(`<span class="or-chip2 c-brand">${frappe.utils.escape_html(row.brand)}</span>`);
			if (row.sales_stage) chips.push(`<span class="or-chip2 c-stage">${frappe.utils.escape_html(row.sales_stage)}</span>`);
			if (row.opportunity_type) chips.push(`<span class="or-chip2 c-type">${frappe.utils.escape_html(row.opportunity_type)}</span>`);
			if (row.expected_closing) chips.push(`<span class="or-chip2 c-exp"><i class="ti ti-flag"></i>${frappe.datetime.str_to_user(row.expected_closing)}</span>`);
			const chipLine = chips.length ? `<div class="or-chips2">${chips.join('')}</div>` : '';
			return `<div class="or-cellcard">${top}${name}${chipLine}</div>`;
		}
		if (val === null || val === undefined || val === '') return '<span style="color:#c2c5cd;">—</span>';
		if (col.fieldtype === 'Link' && col.options === 'Opportunity')
			return `<a href="/app/opportunity/${encodeURIComponent(val)}">${frappe.utils.escape_html(val)}</a>`;
		if (col.fieldtype === 'Link' && col.options === 'Item')
			return `<a href="/app/item/${encodeURIComponent(val)}">${frappe.utils.escape_html(val)}</a>`;
		if (col.fieldtype === 'Currency') return this._inr(val);
		if (col.fieldtype === 'Float') return Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
		if (col.fieldtype === 'Percent') return `${Math.round(Number(val) * 10) / 10}%`;
		if (col.fieldtype === 'Date') return frappe.datetime.str_to_user(val) || val;
		if (col.fieldname === 'status') return this._status(val);
		return frappe.utils.escape_html(String(val));
	}

	_status(s) {
		const colors = { Open: '#2f4de0', Quotation: '#c2620a', Replied: '#6b7280', Converted: '#16a34a', Lost: '#dc2626', Closed: '#374151' };
		const c = colors[s] || '#3a3f4c';
		return `<span style="color:${c};font-weight:500;">${frappe.utils.escape_html(s)}</span>`;
	}

	_fmt(val, datatype) {
		if (datatype === 'Currency') return this._inr_short(val);
		if (datatype === 'Percent') return `${Math.round(Number(val) * 10) / 10}%`;
		if (datatype === 'Int') return Number(val || 0).toLocaleString('en-IN');
		return frappe.utils.escape_html(String(val));
	}

	_inr(v) {
		return '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
	}

	_inr_short(v) {
		v = Number(v || 0);
		if (v >= 1e7) return '₹' + (v / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
		if (v >= 1e5) return '₹' + (v / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
		return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
	}
}