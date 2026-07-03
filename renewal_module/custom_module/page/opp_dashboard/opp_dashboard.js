// Copyright (c) 2026, 64 Network Security Pvt. Ltd.
// Opportunity dashboard — AssetIQ-style, 5 tabs. Page `opp-dashboard` (od- prefix).
// Place at: <your_app>/<your_app>/page/opp_dashboard/opp_dashboard.js

// frappe.pages['opp-dashboard'].on_page_load = function (wrapper) {
// 	var page = frappe.ui.make_app_page({ parent: wrapper, title: 'Opportunity dashboard', single_column: true });
// 	wrapper.opp_dashboard = new OppDashboardPage(page, wrapper);
// };

// frappe.pages['opp-dashboard'].on_page_show = function (wrapper) {
// 	$('body').attr('data-route', 'opp-dashboard');
// 	if (wrapper.opp_dashboard) wrapper.opp_dashboard.show();
// };
frappe.pages['opp-dashboard'].on_page_load = function (wrapper) {
	// page shell is created once; the dashboard instance is created on first show
	new OppDashboardPage(wrapper, wrapper);
};

frappe.pages['opp-dashboard'].on_page_show = function (wrapper) {
	const pageWrapper = wrapper || $('.page')[0] || document.body;
	$('body').attr('data-route', 'opp-dashboard');
	ensureOppDashboardAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof DOMPurify === 'undefined') {
			frappe.require('https://cdn.jsdelivr.net/npm/dompurify@2.4.0/dist/purify.min.js');
		}
		if (typeof loadSupportLayout === 'function') return cb();
		frappe.require(['/assets/renewal_module/js/issue_themes/support_layout2.js'], () => {
			setTimeout(cb, 10);
		});
		frappe.require(['/assets/renewal_module/css/issue_themes/support_theme2.css']);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.opp_dashboard_page || frappe.opp_dashboard_page.wrapper !== pageWrapper) {
				const page = frappe.ui.make_app_page({ parent: pageWrapper, title: 'Opportunity Dashboard', single_column: true });
				frappe.opp_dashboard_page = new OppDashboardPage(page, pageWrapper);
			}
			frappe.opp_dashboard_page.render();
		});
	});
};

function ensureOppDashboardAssets() {
	if (!document.querySelector('link[data-opp-dashboard-fonts="1"]')) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap';
		link.setAttribute('data-opp-dashboard-fonts', '1');
		document.head.appendChild(link);
	}
	if (!document.querySelector('link[data-opp-dashboard-tabler="1"]')) {
		const tabler = document.createElement('link');
		tabler.rel = 'stylesheet';
		tabler.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.30.0/tabler-icons.min.css';
		tabler.setAttribute('data-opp-dashboard-tabler', '1');
		document.head.appendChild(tabler);
	}
}

// >>> set this to your dashboard module path
const OD_API = 'renewal_module.custom_module.page.opp_dashboard.opp_dashboard';

const OD_TABS = [
	{ key: 'overview', label: 'Overview', icon: 'ti-layout-grid' },
	{ key: 'pipeline', label: 'Pipeline & Trends', icon: 'ti-chart-line' },
	{ key: 'forecast', label: 'Forecast', icon: 'ti-calendar-stats' },
	{ key: 'salesperson', label: 'Sales Person', icon: 'ti-users' },
	{ key: 'conversion', label: 'Conversion', icon: 'ti-trending-up' },
];

class OppDashboardPage {
	constructor(page, wrapper) {
		this.page = page;
		this.$body = $(wrapper).find('.layout-main-section');
		this.scope = 'My';
		this.view = 'overview';
		this.timespan = 'this_month';
		this._inject();
		
		this._load_meta();
	}

	render() {
		const waitForContent = () => {
			const $content = $('#support-page-content');
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			// Re-point $body at the support layout's content area
			this.$body = $content;
			this._inject();
			this._scaffold();
			this._load_meta();
			this.setActiveSidebar();
		};
		waitForContent();
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route && route[0];
		$('.side-nav-link').removeClass('active-menu');
		$('.side-nav-item').removeClass('active-menu-item');
		$('.menu-parent').removeClass('active');
		$('.side-nav-link[data-page]').each(function () {
			const linkPage = $(this).data('page');
			if (!linkPage) return;
			if (linkPage === baseRoute) {
				$(this).addClass('active-menu');
				$(this).closest('.side-nav-item').addClass('active-menu-item');
				const $parent = $(this).closest('.menu-parent');
				if ($parent.length) {
					$parent.addClass('active');
					$parent.closest('.sub-menu').each((idx, el) => {
						const $ancestor = $(el).closest('.menu-parent');
						if ($ancestor.length) $ancestor.addClass('active');
					});
				}
			}
		});
		if (window.syncSupportSidebarArrows) window.syncSupportSidebarArrows();
	}

	_inject() {
		if (!document.getElementById('od-fonts')) {
			const l = document.createElement('link'); l.id = 'od-fonts'; l.rel = 'stylesheet';
			l.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap';
			document.head.appendChild(l);
		}
		if (!document.getElementById('od-tabler')) {
			const t = document.createElement('link'); t.id = 'od-tabler'; t.rel = 'stylesheet';
			t.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.30.0/tabler-icons.min.css';
			document.head.appendChild(t);
		}
		if (document.getElementById('od-styles')) return;
		const css = `
		.od{--bg:#f0f3fb;--sf:#fff;--s2:#f5f7fd;--s3:#eaedfa;--br:#e0e5f2;--ac:#2f4de0;--ac2:#2240cc;
		   --ok:#1a8f5c;--am:#b87800;--dg:#c42b2b;--pu:#7c3aed;--tl:#0b8c78;--mu:#97a2bf;--m2:#68748f;
		   --tx:#141928;--ts:#3c4464;--fh:'Syne',sans-serif;--fb:'DM Sans',sans-serif;
		   --sh:0 1px 3px rgba(20,25,46,.07),0 4px 16px rgba(20,25,46,.04);--shm:0 4px 24px rgba(20,25,46,.11);
		   font-family:var(--fb);color:var(--tx);}
		.od h1,.od h2,.od h3,.od .fh{font-family:var(--fh);}
		.od-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
		.od-tabs{display:flex;gap:0;flex-wrap:wrap;border-bottom:1px solid var(--br);margin-bottom:16px;}
		.od-tab{padding:10px 16px;font-size:13px;font-weight:600;color:var(--m2);cursor:pointer;border-bottom:2.5px solid transparent;display:flex;align-items:center;gap:7px;white-space:nowrap;}
		.od-tab i{font-size:16px;}
		.od-tab:hover{color:var(--tx);}
		.od-tab.active{color:var(--ac);border-bottom-color:var(--ac);}
		.od-qf{display:flex;gap:4px;flex-wrap:wrap;}
		.od-q{padding:5px 13px;border-radius:20px;font-size:12.5px;font-weight:500;background:var(--sf);border:1.5px solid var(--br);color:var(--m2);cursor:pointer;}
		.od-q:hover{border-color:var(--ac);color:var(--ac);}
		.od-q.active{background:var(--ac);border-color:var(--ac);color:#fff;}
		.od-scope{display:inline-flex;border:1px solid var(--br);border-radius:8px;overflow:hidden;margin-left:auto;}
		.od-scope button{border:none;background:var(--sf);padding:7px 14px;font-size:13px;color:var(--m2);cursor:pointer;border-right:1px solid var(--br);font-family:var(--fb);display:inline-flex;align-items:center;gap:6px;}
		.od-scope button:last-child{border-right:none;}
		.od-scope button.active{background:rgba(47,77,224,.08);color:var(--ac);font-weight:500;}
		.od-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:13px;margin-bottom:18px;}
		.od-kpi{background:var(--sf);border:1px solid var(--br);border-radius:12px;padding:16px 18px;box-shadow:var(--sh);position:relative;overflow:hidden;}
		.od-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
		.od-kpi.blue::before{background:var(--ac);} .od-kpi.green::before{background:var(--ok);}
		.od-kpi.amber::before{background:#e0a000;} .od-kpi.red::before{background:var(--dg);}
		.od-kpi.purple::before{background:var(--pu);}
		.od-kic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;margin-bottom:10px;font-size:17px;}
		.od-kpi.blue .od-kic{background:rgba(47,77,224,.08);color:var(--ac);}
		.od-kpi.green .od-kic{background:rgba(26,143,92,.1);color:var(--ok);}
		.od-kpi.amber .od-kic{background:rgba(184,120,0,.1);color:var(--am);}
		.od-kpi.red .od-kic{background:rgba(196,43,43,.08);color:var(--dg);}
		.od-kpi.purple .od-kic{background:rgba(124,58,237,.08);color:var(--pu);}
		.od-kv{font-family:var(--fh);font-size:25px;font-weight:800;letter-spacing:-.5px;}
		.od-kl{font-size:12px;color:var(--mu);font-weight:500;margin-top:3px;}
		.od-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:10px;}
		.od-card{background:var(--sf);border:1px solid var(--br);border-radius:12px;box-shadow:var(--sh);overflow:hidden;}
		.w-wide{grid-column:span 12;} .w-half{grid-column:span 6;} .w-third{grid-column:span 4;}
		@media(max-width:900px){.w-half,.w-third{grid-column:span 12;}}
		.od-ch{padding:13px 18px;border-bottom:1px solid var(--br);background:var(--s2);}
		.od-ct{font-family:var(--fh);font-size:13px;font-weight:700;}
		.od-cs{font-size:11.5px;color:var(--mu);}
		.od-cb{padding:18px;}
		.od-hb{display:flex;flex-direction:column;gap:11px;}
		.od-hbi{display:flex;flex-direction:column;gap:4px;}
		.od-hbm{display:flex;justify-content:space-between;align-items:center;}
		.od-hbn{font-size:12.5px;font-weight:500;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;}
		.od-hbv{font-size:12px;font-weight:700;}
		.od-hbt{height:7px;background:var(--s3);border-radius:10px;overflow:hidden;}
		.od-hbf{height:100%;border-radius:10px;}
		.od-dw{display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
		.od-leg{display:flex;flex-direction:column;gap:7px;flex:1;min-width:140px;}
		.od-li{display:flex;align-items:center;gap:7px;font-size:12.5px;}
		.od-ld{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
		.od-ln{color:var(--ts);flex:1;}
		.od-lv{font-weight:700;}
		.od-lp{font-size:11px;color:var(--mu);}
		.od-tbl{width:100%;border-collapse:collapse;}
		.od-tbl th{padding:8px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mu);border-bottom:1px solid var(--br);background:var(--s2);white-space:nowrap;}
		.od-tbl td{padding:10px 12px;font-size:13px;color:var(--ts);border-bottom:1px solid var(--br);white-space:nowrap;}
		.od-tbl tr:last-child td{border-bottom:none;}
		.od-tbl tr:hover td{background:var(--s2);}
		.od-av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#2f4de0,#6d88f8);display:inline-grid;place-items:center;font-size:10px;font-weight:700;color:#fff;margin-right:8px;vertical-align:middle;}
		.od-sbar{width:54px;height:5px;background:var(--s3);border-radius:10px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px;}
		.od-sfill{height:100%;border-radius:10px;background:var(--ac);}
		.od-a{color:var(--ac);font-weight:700;text-decoration:none;}
		.od-empty{padding:50px;text-align:center;color:var(--mu);font-size:13px;}
		.od-r{text-align:right;}
		.od-delta{display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;margin-top:6px;}
		.od-delta i{font-size:13px;}
		.od-delta.up{color:var(--ok);} .od-delta.down{color:var(--dg);} .od-delta.flat{color:var(--mu);}
		.od-clk{cursor:pointer;transition:transform .14s,box-shadow .14s;}
		.od-clk:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(20,25,46,.12);}
		.od-clk .od-kv{text-decoration:underline;text-decoration-color:rgba(47,77,224,.25);text-underline-offset:3px;}
		.od-drill{margin-top:18px;border:1px solid var(--br);border-radius:12px;background:var(--s2);overflow:hidden;animation:od-fade .2s ease;}
		@keyframes od-fade{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
		.od-drill-hd{
		
			position:sticky;
			top:0;
			z-index:2;

		    display:flex;align-items:center;
			justify-content:space-between;
			padding:12px 16px;
			border-bottom:1px solid var(--br);
			background:var(--sf);
			}
		.od-drill-t{font-family:var(--fh);font-size:14px;font-weight:700;}
		.od-drill-c{font-size:12px;color:var(--mu);margin-left:8px;}
		.od-drill-x{border:1px solid var(--br);background:var(--sf);border-radius:7px;padding:5px 12px;font-size:12px;color:var(--m2);cursor:pointer;}
		.od-drill-x:hover{background:var(--s3);color:var(--tx);}
		.od-drill-body{padding:16px;
		
			max-height:420px;       /* ✅ limit height */
			overflow-y:auto; 
			}
		.od-fbrand,.od-fcat,.od-spfilter{flex-wrap:nowrap;}
		.od-brand .frappe-control,.od-cat .frappe-control,.od-sp .frappe-control{margin:0 !important;}
		.od-brand .form-group,.od-cat .form-group,.od-sp .form-group{margin:0 !important;}
		.od-brand .control-label,.od-cat .control-label,.od-sp .control-label,
		.od-brand .help-box,.od-cat .help-box,.od-sp .help-box,
		.od-brand .clearfix,.od-cat .clearfix,.od-sp .clearfix{display:none !important;}

		.od-kpis{
  grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); /* smaller width */
  gap:10px;
}

.od-kpi{
  padding:10px 10px;  /* less padding */
  border-radius:10px;
}

.od-kic{
  width:28px;
  height:28px;
  font-size:14px;
  margin-bottom:8px;
}

.od-kv{
  font-size:28px;  /* reduce headline number */
  font-weight:700;
}

.od-kl{
  font-size:11px;
}

.od-dd{position:relative;display:inline-block;}
		.od-dd-btn{display:inline-flex;align-items:center;gap:8px;height:32px;min-width:150px;border:1px solid var(--br);background:var(--sf);border-radius:8px;padding:0 10px;font-size:12.5px;color:var(--m2);font-family:var(--fb);cursor:pointer;justify-content:space-between;}
		.od-dd-btn:hover{border-color:var(--b2);}
		.od-dd-btn i{font-size:15px;color:var(--mu);transition:transform .15s;}
		.od-dd.open .od-dd-btn i{transform:rotate(180deg);}
		.od-dd-lbl.on{color:var(--ac);font-weight:600;}
		.od-dd-menu{display:none;position:absolute;top:36px;left:0;z-index:50;min-width:200px;max-height:260px;overflow-y:auto;background:var(--sf);border:1px solid var(--br);border-radius:10px;box-shadow:var(--shm);padding:5px;}
		.od-dd.open .od-dd-menu{display:block;}
		.od-dd-opt{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;font-size:12.5px;color:var(--tx);cursor:pointer;}
		.od-dd-opt:hover{background:var(--s2);}
		.od-dd-opt input{margin:0;cursor:pointer;}

.od-fnl{display:flex;flex-direction:column;gap:8px;padding-top:4px;}
		.od-fnl-row{position:relative;}
		.od-fnl-nm{position:absolute;left:2px;top:50%;transform:translateY(-50%);z-index:3;font-size:12.5px;font-weight:600;color:var(--tx);text-shadow:0 1px 2px rgba(255,255,255,.6);}
		.od-fnl-meta{position:absolute;right:2px;top:50%;transform:translateY(-50%);z-index:3;font-size:11.5px;color:var(--m2);text-align:right;}
		.od-fnl-d{color:var(--dg);font-weight:700;}
		.od-fnl-bar-wrap{height:44px;display:flex;align-items:center;justify-content:center;}
		.od-fnl-bar{width:100%;height:100%;border-radius:3px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(20,25,46,.08);}
		.od-fnl-val{color:#fff;font-weight:800;font-size:14px;letter-spacing:-.3px;text-shadow:0 1px 2px rgba(0,0,0,.18);}
		


		.od-fsv{width:100%;height:auto;display:block;margin-top:2px;}
		.od-fsv-nm{font-family:var(--fb);font-weight:600;font-size:13px;fill:var(--tx);}
		.od-fsv-val{font-family:var(--fh);font-weight:800;font-size:15px;fill:#fff;}
		.od-fsv-cnt{font-family:var(--fh);font-weight:700;font-size:13px;fill:var(--ts);}
		.od-fsv-drop{font-family:var(--fb);font-weight:600;font-size:12px;fill:var(--dg);}
		.od-fsv-tgt{stroke:#f4a418;stroke-width:2;stroke-dasharray:4 4;stroke-linecap:round;}
		.od-fsv-tgtlbl{font-family:var(--fb);font-weight:600;font-size:10px;fill:#b5760a;}
		.od-fsv-legend{display:flex;flex-wrap:wrap;gap:18px;margin-top:12px;padding-top:12px;border-top:1px solid var(--br);font-size:12px;color:var(--m2);}
		.od-fsv-legend span{display:inline-flex;align-items:center;gap:7px;}
		.od-fsv-dash{width:22px;height:0;border-top:2px dashed #f4a418;}
		
		
		
		
		
		`;
		const s = document.createElement('style'); s.id = 'od-styles'; s.textContent = css;
		document.head.appendChild(s);
	}

	_scaffold() {
		const spanOpts = [
			['', 'All time'], ['last_year', 'Last year'], ['last_quarter', 'Last quarter'],
			['last_month', 'Last month'], ['last_week', 'Last week'],
			['this_week', 'This week'], ['this_month', 'This month'], ['this_quarter', 'This quarter'],
			['this_half', 'This half-year'], ['this_year', 'This year'],
			['next_week', 'Next week'], ['next_month', 'Next month'], ['next_quarter', 'Next quarter'],
			['custom', 'Custom…'],
		].map(([v, l]) => `<option value="${v}"${v === this.timespan ? ' selected' : ''}>${l}</option>`).join('');
		this.$body.html(`
			<div class="od">
				<div class="od-tabs"></div>
				<div class="od-bar">
					<span style="font-size:12.5px;font-weight:600;color:var(--m2);">Period:</span>
					<select class="od-span" style="height:30px;border:1px solid var(--br);border-radius:7px;padding:0 8px;font-size:12.5px;background:var(--sf);color:var(--tx);min-width:140px;">${spanOpts}</select>
					<div class="od-custom" style="display:none;align-items:center;gap:6px;">
						<input type="date" class="od-from" style="height:30px;border:1px solid var(--br);border-radius:7px;padding:0 8px;font-size:12.5px;">
						<span style="color:var(--mu);font-size:12px;">→</span>
						<input type="date" class="od-to" style="height:30px;border:1px solid var(--br);border-radius:7px;padding:0 8px;font-size:12.5px;">
					</div>
					<div class="od-fbrand" style="display:flex;align-items:center;gap:6px;">
						<span style="font-size:12.5px;font-weight:600;color:var(--m2);">Brand:</span>
						<div class="od-brand" style="min-width:150px;"></div>
					</div>
					<div class="od-fcat" style="display:flex;align-items:center;gap:6px;">
						<span style="font-size:12.5px;font-weight:600;color:var(--m2);">Category:</span>
						<div class="od-cat" style="min-width:150px;"></div>
					</div>
					<div class="od-spfilter" style="display:none;align-items:center;gap:6px;">
						<span style="font-size:12.5px;font-weight:600;color:var(--m2);">Sales person:</span>
						<div class="od-sp" style="min-width:170px;"></div>
					</div>
					<div class="od-scope" style="margin-left:auto;"></div>
				</div>
				<div class="od-content"><div class="od-empty">Loading…</div></div>
			</div>`);

		this.$body.find('.od-span').on('change', (e) => {
			this.timespan = $(e.currentTarget).val();
			const isCustom = this.timespan === 'custom';
			this.$body.find('.od-custom').css('display', isCustom ? 'flex' : 'none');
			if (!isCustom) this._render_active();
		});
		this.$body.find('.od-from, .od-to').on('change', () => {
			if (this.timespan === 'custom') this._render_active();
		});



		// ── generic drill: any element with data-drill opens its detail table ──
		this.$body.off('click.drill').on('click.drill', (e) => {
			const el = e.target.closest('[data-drill]');
			if (!el || !this.$body[0].contains(el)) return;
			e.stopPropagation();
			// the card this element lives in (SVG funnel and HTML rows both work)
			const cardEl = el.closest('.od-card');
			const $afterCard = cardEl ? $(cardEl) : null;
			this._drillBy(
				{ type: el.getAttribute('data-drill'), key: el.getAttribute('data-key') || '' },
				el.getAttribute('data-label') || '',
				$afterCard
			);
		});


		// follow-up strip → open the grouped view
		this.$body.off('click.fu').on('click.fu', '[data-fu]', () => this._openFollowups());
	}   // ← end of _scaffold

	_load_meta() {
		frappe.call({ method: `${OD_API}.get_meta` }).then((r) => {
			const m = r.message || {};
			this._tabMap = m.tabs || {};
			this._build_scope((m.scopes || ['My']));
			this._build_tabs();
			this._render_active();
		});
	}

	_build_tabs() {
		const tabs = (this._tabMap && this._tabMap[this.scope]) || OD_TABS;
		// keep current view if it still exists in this scope, else first tab
		if (!tabs.some((t) => t.key === this.view)) this.view = tabs[0].key;
		const strip = this.$body.find('.od-tabs').empty();
		tabs.forEach((t) => {
			const el = $(`<div class="od-tab${t.key === this.view ? ' active' : ''}" data-view="${t.key}"><i class="ti ${t.icon}"></i>${frappe.utils.escape_html(t.label)}</div>`);
			el.on('click', () => {
				this.view = t.key;
				strip.find('.od-tab').removeClass('active');
				el.addClass('active');
				this._render_active();
			});
			strip.append(el);
		});
		this._sync_filters();
	}

	_mkMulti(mount, kind, placeholder) {
		const self = this;
		const wrap = document.createElement('div');
		wrap.className = 'od-dd';
		wrap.innerHTML = `<button type="button" class="od-dd-btn"><span class="od-dd-lbl">${placeholder}</span><i class="ti ti-chevron-down"></i></button><div class="od-dd-menu"></div>`;
		mount.appendChild(wrap);
		const btn = wrap.querySelector('.od-dd-btn');
		const lbl = wrap.querySelector('.od-dd-lbl');
		const menu = wrap.querySelector('.od-dd-menu');
		const ctrl = { _values: [], _placeholder: placeholder, getValues: () => ctrl._values.slice() };

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			document.querySelectorAll('.od-dd.open').forEach((d) => { if (d !== wrap) d.classList.remove('open'); });
			wrap.classList.toggle('open');
		});
		document.addEventListener('click', () => wrap.classList.remove('open'));
		menu.addEventListener('click', (e) => e.stopPropagation());

		const sync = () => {
			lbl.textContent = ctrl._values.length ? `${ctrl._values.length} selected` : placeholder;
			lbl.classList.toggle('on', ctrl._values.length > 0);
		};
		frappe.call({ method: `${OD_API}.dash_options`, args: { kind, scope: this.scope, txt: '' } })
			.then((r) => {
				(r.message || []).forEach((o) => {
					const row = document.createElement('label');
					row.className = 'od-dd-opt';
					row.innerHTML = `<input type="checkbox" value="${frappe.utils.escape_html(o.value)}"><span>${frappe.utils.escape_html(o.label || o.value)}</span>`;
					row.querySelector('input').addEventListener('change', (ev) => {
						const v = ev.target.value;
						if (ev.target.checked) ctrl._values.push(v);
						else ctrl._values = ctrl._values.filter((x) => x !== v);
						sync();
						self._render_active();
					});
					menu.appendChild(row);
				});
			});
		return ctrl;
	}

	_sync_filters() {
		// Brand + Category: all scopes (build once)
		if (!this.brandControl) {
			const bm = this.$body.find('.od-brand').empty().get(0);
			if (bm) this.brandControl = this._mkMulti(bm, 'brand', __('All brands'));
		}
		if (!this.catControl) {
			const cm = this.$body.find('.od-cat').empty().get(0);
			if (cm) this.catControl = this._mkMulti(cm, 'item_category', __('All categories'));
		}
		// Sales Person: Team / Organization only — rebuild per scope (options differ)
		const show = (this.scope === 'My Team' || this.scope === 'Organization');
		this.$body.find('.od-spfilter').css('display', show ? 'flex' : 'none');
		if (!show) { this.spControl = null; this.$body.find('.od-sp').empty(); return; }
		const mount = this.$body.find('.od-sp').empty().get(0);
		this.spControl = this._mkMulti(mount, 'sales_person', __('All sales people'));
	}

	_ctrlValues(c) {
		if (!c) return [];
		return (typeof c.getValues === 'function') ? c.getValues() : [];
	}

	_sp_values() { return this._ctrlValues(this.spControl); }

	_build_scope(scopes) {
		const wrap = this.$body.find('.od-scope').empty();
		const icons = { 'My': 'ti-user', 'My Team': 'ti-users', 'Organization': 'ti-building' };
		scopes.forEach((s) => {
			const b = $(`<button data-scope="${s}"><i class="ti ${icons[s] || 'ti-user'}"></i>${s}</button>`);
			if (s === this.scope) b.addClass('active');
			b.on('click', () => { this.scope = s; wrap.find('button').removeClass('active'); b.addClass('active'); this._build_tabs(); this._render_active(); });
			wrap.append(b);
		});
		if (!scopes.includes(this.scope)) this.scope = scopes[0];
	}

	show() { if (this._loaded) this._render_active(); }

	_filters() {
		const f = { timespan: this.timespan };
		if (this.timespan === 'custom') {
			f.from_date = this.$body.find('.od-from').val();
			f.to_date = this.$body.find('.od-to').val();
		}
		const sp = this._sp_values();
		if (sp.length) f.sales_person = sp;
		const br = this._ctrlValues(this.brandControl);
		if (br.length) f.brand = br;
		const cat = this._ctrlValues(this.catControl);
		if (cat.length) f.item_category = cat;
		return f;
	}

	_render_active() {
		this._loaded = true;
		const content = this.$body.find('.od-content').html('<div class="od-empty">Loading…</div>');
		const filters = this._filters();
		this._lastFilters = filters;
		frappe.call({
			method: `${OD_API}.get_dashboard`,
			args: { view: this.view, scope: this.scope, filters: JSON.stringify(filters) },
		}).then((r) => this._render(content, r.message || {}))
		  .catch(() => content.html('<div class="od-empty">Could not load the dashboard.</div>'));
	}

	_render(content, d) {
		content.empty();
		if (d.followup_summary) content.append(this._followup_strip(d.followup_summary));   // ← add this line
		if (d.kpis && d.kpis.length) {
			const g = $('<div class="od-kpis"></div>');
			d.kpis.forEach((k) => {
				const clickable = !!k.metric;
				const card = $(`
					<div class="od-kpi ${k.indicator} ${clickable ? 'od-clk' : ''}">
						<div class="od-kic"><i class="ti ${k.icon}"></i></div>

						<div class="od-kv-wrap">
							<div class="od-kv">${this._fmt(k.value, k.datatype)}</div>
							${this._sparkline(k.spark || [])}
						</div>

						<div class="od-kl">${frappe.utils.escape_html(k.label)}</div>
						${this._deltaHtml(k.delta)}
					</div>`);
				if (clickable) card.on('click', () => {
					const wasActive = card.hasClass('od-active');
					this.$body.find('.od-kpi').removeClass('od-active');
					if (!wasActive) card.addClass('od-active');
					this._drill(k.metric, k.label);
				});
				g.append(card);
			});
			content.append(g);
			content.append('<div class="od-drill-mount"></div>');
		}
		if (d.blocks && d.blocks.length) {
			const grid = $('<div class="od-grid"></div>');
			d.blocks.forEach((b) => grid.append(this._block(b)));
			content.append(grid);
		}
		// content.append('<div class="od-drill-mount"></div>');
		if (!d.kpis && !d.blocks) content.append('<div class="od-empty">No data.</div>');
	}


	_sparkline(vals){
		if(!vals || !vals.length) return '';
		const max = Math.max(...vals,1), W=80,H=24;
		const pts = vals.map((v,i)=>`${(i*W)/(vals.length-1||1)},${H-2-(v/max)*(H-4)}`).join(' ');
		return `<svg width="${W}" height="${H}">
			<polyline points="${pts}" fill="none" stroke="#2f4de0" stroke-width="1.5"/>
		</svg>`;
	}

	_deltaHtml(delta) {
		if (!delta) return '';
		if (delta.pct === null) return `<div class="od-delta flat"><i class="ti ti-minus"></i>${frappe.utils.escape_html(delta.label || '')}</div>`;
		const cls = delta.dir === 'up' ? 'up' : (delta.dir === 'down' ? 'down' : 'flat');
		const arrow = delta.dir === 'up' ? 'ti-trending-up' : (delta.dir === 'down' ? 'ti-trending-down' : 'ti-minus');
		const sign = delta.pct > 0 ? '+' : '';
		return `<div class="od-delta ${cls}"><i class="ti ${arrow}"></i>${sign}${delta.pct}% ${frappe.utils.escape_html(delta.label || '')}</div>`;
	}

	// _drill(metric, label) {
	// 	const mount = this.$body.find('.od-drill-mount');
	// 	if (this._openMetric === metric) { mount.empty(); this._openMetric = null; return; } // toggle off
	// 	this._openMetric = metric;
	// 	mount.html('<div class="od-drill"><div class="od-empty">Loading…</div></div>');
	// 	frappe.call({
	// 		method: `${OD_API}.overview_drill`,
	// 		args: { metric, scope: this.scope, filters: JSON.stringify(this._lastFilters || {}) },
	// 	}).then((r) => {
	// 		const d = r.message || {};
	// 		const wrap = $(`<div class="od-drill w-wide">
	// 			<div class="od-drill-hd"><div><span class="od-drill-t">${frappe.utils.escape_html(d.title || label)}</span>
	// 			<span class="od-drill-c">${d.count || 0} ${__('records')}</span></div>
	// 			<button class="od-drill-x">${__('Close')}</button></div>
	// 			<div class="od-grid od-drill-body"></div></div>`);
	// 		const body = wrap.find('.od-drill-body');
	// 		(d.blocks || []).forEach((b) => body.append(this._block(b)));
	// 		wrap.find('.od-drill-x').on('click', () => { mount.empty(); this._openMetric = null; });
	// 		mount.empty().append(wrap);
	// 		wrap.get(0).scrollIntoView({ behavior: 'smooth', block: 'start' });
	// 	}).catch(() => mount.html('<div class="od-drill"><div class="od-empty">Could not load detail.</div></div>'));
	// }


	_drill(metric, label) {
		const mount = this.$body.find('.od-drill-mount');
		if (this._openMetric === metric) {
			mount.empty(); this._openMetric = null;
			this.$body.find('.od-kpi').removeClass('od-active');   // ← add
			return;
		}
		this._openMetric = metric;
		this._drillPage = 0;
		this._loadDrill(metric, label, mount, true);
	}

	_loadDrill(metric, label, mount, fresh) {
		frappe.call({
			method: `${OD_API}.overview_drill`,
			args: { metric, scope: this.scope, filters: JSON.stringify(this._lastFilters || {}), page: this._drillPage },
		}).then((r) => {
			const d = r.message || {};
			if (fresh) {
				const wrap = $(`<div class="od-drill">
					<div class="od-drill-hd"><div><span class="od-drill-t">${frappe.utils.escape_html(d.title || label)}</span>
					<span class="od-drill-c">${d.shown} ${__('of')} ${d.count}</span></div>
					<div style="display:flex;gap:8px;">
						<a class="od-drill-open" href="${d.list_route}" target="_blank" rel="noopener">${__('Open in list')} <i class="ti ti-external-link"></i></a>
						<button class="od-drill-x">${__('Close')}</button>
					</div></div>
					<div class="od-grid od-drill-body"></div>
					<div class="od-drill-foot"></div></div>`);
				(d.blocks || []).forEach((b) => wrap.find('.od-drill-body').append(this._block(b)));
				wrap.find('.od-drill-x').on('click', () => {
			mount.empty(); this._openMetric = null;
			this.$body.find('.od-kpi').removeClass('od-active');   // ← add
		});
				mount.empty().append(wrap);
				wrap.get(0).scrollIntoView({ behavior: 'smooth', block: 'start' });
			} else {
				// append next page's table rows into the existing table body
				const newTable = this._block(d.blocks[0]);
				mount.find('.od-drill-body table tbody').append(newTable.find('table tbody tr'));
				mount.find('.od-drill-c').text(`${d.shown} ${__('of')} ${d.count}`);
			}
			const foot = mount.find('.od-drill-foot').empty();
			if (d.has_more) {
				const btn = $(`<button class="od-more">${__('Show more')} (+20)</button>`);
				btn.on('click', () => { this._drillPage += 1; this._loadDrill(metric, label, mount, false); });
				foot.append(btn);
			}
		}).catch(() => mount.html('<div class="od-drill"><div class="od-empty">Could not load detail.</div></div>'));
	}


	_drillBy(payload, label, $afterCard) {
		const mount = $('<div class="od-drill w-wide-strip"><div class="od-empty">Loading…</div></div>');
		// insert after the entire grid row, not inside it
		const $grid = $afterCard && $afterCard.closest('.od-grid').length
			? $afterCard.closest('.od-grid')
			: this.$body.find('.od-content .od-grid').first();
		$grid.after(mount);
		this._$drill = mount;
		const id = payload.type + ':' + (payload.key || '');
		// toggle off if same drill is open
		if (this._openMetric === id && this._$drill) {
			this._$drill.remove(); this._$drill = null; this._openMetric = null; return;
		}
		if (this._$drill) { this._$drill.remove(); this._$drill = null; }
		this._openMetric = id;

		// const mount = $('<div class="od-drill w-wide"><div class="od-empty">Loading…</div></div>');
		// place it right after the card that was clicked (fallback: top mount)
		if ($afterCard && $afterCard.length) $afterCard.after(mount);
		else this.$body.find('.od-drill-mount').first().append(mount);
		this._$drill = mount;

		frappe.call({
			method: `${OD_API}.drill`,
			args: { payload: JSON.stringify(payload), scope: this.scope, filters: JSON.stringify(this._lastFilters || {}) },
		}).then((r) => {
			const d = r.message || {};
			const wrap = $(`<div class="od-drill w-wide">
				<div class="od-drill-hd"><div><span class="od-drill-t">${frappe.utils.escape_html(d.title || label)}</span>
				<span class="od-drill-c">${d.count || 0} ${__('records')}</span></div>
				<button class="od-drill-x">${__('Close')}</button></div>
				<div class="od-grid od-drill-body"></div></div>`);
			(d.blocks || []).forEach((b) => wrap.find('.od-drill-body').append(this._block(b)));
			wrap.find('.od-drill-x').on('click', () => { wrap.remove(); this._$drill = null; this._openMetric = null; });
			mount.replaceWith(wrap);
			this._$drill = wrap;
			wrap.get(0).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}).catch(() => mount.html('<div class="od-drill"><div class="od-empty">Could not load detail.</div></div>'));
	}

	_block(b) {
		const w = b.w === 'half' ? 'w-half' : b.w === 'third' ? 'w-third' : 'w-wide';
		const card = $(`<div class="od-card ${w}">
			<div class="od-ch"><div class="od-ct">${frappe.utils.escape_html(b.title || '')}</div>${b.sub ? `<div class="od-cs">${frappe.utils.escape_html(b.sub)}</div>` : ''}</div>
			<div class="od-cb"></div></div>`);
		const body = card.find('.od-cb');
		if (b.type === 'trend') body.html(this._trend(b));
		else if (b.type === 'areastack') body.html(this._areastack(b));
		else if (b.type === 'donut') body.html(this._donut(b));
		else if (b.type === 'hbars') body.html(this._hbars(b));
		else if (b.type === 'funnel') body.html(this._funnel(b));
		else if (b.type === 'funnel_t') body.html(this._funnel_t(b));
		else if (b.type === 'funnel_svg') body.html(this._funnel_svg(b));
		else if (b.type === 'dual_donut') body.html(this._dual_donut(b));   // add to _block
		else if (b.type === 'quota') body.html(this._quota(b));
		else if (b.type === 'forecast_card') body.html(this._forecast_card(b));
		else if (b.type === 'avt') body.html(this._avt(b));
		else if (b.type === 'actlist') body.html(this._actlist(b));
		else if (b.type === 'lostbars') body.html(this._lostbars(b));
		else if (b.type === 'statlist') body.html(this._statlist(b));
		else if (b.type === 'renewals') body.html(this._renewals(b));
		else if (b.type === 'heatmap') body.html(this._heatmap(b));
		else if (b.type === 'gauge') body.html(this._gauge(b));
		else if (b.type === 'table') body.html(this._table(b));
		else if (b.type === 'followups') body.html(this._followups(b));
		return card;
	}

	_trend(b) {
		const W = 560, H = 150, pad = 8;
		const all = [].concat(...b.series.map((s) => s.values));
		const max = Math.max(...all, 1);
		const n = (b.xlabels || []).length || 1;
		const xs = (i) => pad + (i * (W - pad * 2)) / Math.max(n - 1, 1);
		const ys = (v) => H - 24 - (v / max) * (H - 40);
		let svg = `<svg width="100%" height="160" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
		[0.25, 0.5, 0.75, 1].forEach((g) => { const y = H - 24 - g * (H - 40); svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#e0e5f2" stroke-width="1"/>`; });
		b.series.forEach((s) => {
			const pts = s.values.map((v, i) => `${xs(i)},${ys(v)}`).join(' ');
			const area = `${pad},${H - 24} ` + pts + ` ${xs(n - 1)},${H - 24}`;
			svg += `<polygon points="${area}" fill="${s.color}" opacity="0.10"/>`;
			svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
		});
		(b.xlabels || []).forEach((lb, i) => { if (n <= 8 || i % 2 === 0) svg += `<text x="${xs(i)}" y="${H - 6}" font-size="9" fill="#97a2bf" text-anchor="middle" font-family="DM Sans">${lb}</text>`; });
		svg += '</svg>';
		const leg = b.series.map((s) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--m2);margin-right:14px;"><span style="width:12px;height:3px;border-radius:4px;background:${s.color};"></span>${frappe.utils.escape_html(s.name)}</span>`).join('');
		return svg + `<div style="margin-top:6px;">${leg}</div>`;
	}

	_donut(b) {
		const total = b.segments.reduce((a, s) => a + Number(s.value), 0) || 1;
		const r = 40, C = 2 * Math.PI * r;
		let off = 0;
		let arcs = `<circle cx="55" cy="55" r="${r}" fill="none" stroke="#e0e5f2" stroke-width="14"/>`;
		b.segments.forEach((s) => {
			const frac = Number(s.value) / total;
			const len = frac * C;
			arcs += `<circle cx="55" cy="55" r="${r}" fill="none" stroke="${s.color}" stroke-width="14" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 55 55)"/>`;
			off += len;
		});
		const center = `<text x="55" y="51" text-anchor="middle" font-size="14" font-weight="800" fill="#141928" font-family="Syne">${this._short(b.total)}</text><text x="55" y="64" text-anchor="middle" font-size="9" fill="#97a2bf" font-family="DM Sans">${frappe.utils.escape_html(b.total_label || '')}</text>`;
		const legend = b.segments.map((s) => {
			const pct = Math.round((Number(s.value) / total) * 1000) / 10;
			return `<div class="od-li"><div class="od-ld" style="background:${s.color}"></div><span class="od-ln">${frappe.utils.escape_html(s.label)}</span><span class="od-lv">${Number(s.value).toLocaleString('en-IN')}</span><span class="od-lp">${pct}%</span></div>`;
		}).join('');
		return `<div class="od-dw"><svg width="110" height="110" viewBox="0 0 110 110">${arcs}${center}</svg><div class="od-leg">${legend}</div></div>`;
	}

	_areastack(b) {
		const W = 560, H = 150, pad = 8;
		const n = (b.xlabels || []).length || 1;
		// cumulative stack
		const cum = b.series[0].values.map(() => 0);
		const totals = b.series[0].values.map((_, i) => b.series.reduce((a, s) => a + Number(s.values[i] || 0), 0));
		const max = Math.max(...totals, 1);
		const xs = (i) => pad + (i * (W - pad * 2)) / Math.max(n - 1, 1);
		const ys = (v) => H - 24 - (v / max) * (H - 40);
		let svg = `<svg width="100%" height="160" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
		[0.25, 0.5, 0.75, 1].forEach((g) => { const y = H - 24 - g * (H - 40); svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#e0e5f2" stroke-width="1"/>`; });
		b.series.forEach((s) => {
			const lower = cum.slice();
			const upper = cum.map((c, i) => c + Number(s.values[i] || 0));
			const top = upper.map((v, i) => `${xs(i)},${ys(v)}`).join(' ');
			const bot = lower.map((v, i) => `${xs(i)},${ys(v)}`).reverse().join(' ');
			svg += `<polygon points="${top} ${bot}" fill="${s.color}" opacity="0.85"/>`;
			for (let i = 0; i < cum.length; i++) cum[i] = upper[i];
		});
		(b.xlabels || []).forEach((lb, i) => { if (n <= 8 || i % 2 === 0) svg += `<text x="${xs(i)}" y="${H - 6}" font-size="9" fill="#97a2bf" text-anchor="middle" font-family="DM Sans">${lb}</text>`; });
		svg += '</svg>';
		const leg = b.series.map((s) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--m2);margin-right:12px;"><span style="width:10px;height:10px;border-radius:3px;background:${s.color};"></span>${frappe.utils.escape_html(s.name)}</span>`).join('');
		return svg + `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:2px;">${leg}</div>`;
	}

	_funnel(b) {
		if (!b.steps || !b.steps.length) return '<div class="od-empty" style="padding:20px;">No data</div>';
		return '<div style="display:flex;flex-direction:column;gap:8px;">' + b.steps.map((s) => `
			<div>
				<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
					<span style="font-size:12.5px;font-weight:500;">${frappe.utils.escape_html(s.label)}</span>
					<span style="font-size:12px;color:var(--mu);">${Number(s.value).toLocaleString('en-IN')}${s.dropoff ? ` · <span style="color:var(--dg);">▼${s.dropoff}%</span>` : ''}</span>
				</div>
				<div style="height:26px;background:var(--s3);border-radius:6px;overflow:hidden;display:flex;align-items:center;">
					<div style="height:100%;width:${Math.max(s.pct, 3)}%;background:${s.color};border-radius:6px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:11px;font-weight:600;min-width:34px;">${s.pct}%</div>
				</div>
			</div>`).join('') + '</div>';
	}


	_funnel_t(b) {
		if (!b.steps || !b.steps.length) return '<div class="od-empty" style="padding:20px;">No data</div>';
		const fmt = (s) => s.money ? this._short(s.value) : Number(s.value).toLocaleString('en-IN');
		return '<div class="od-fnl">' + b.steps.map((s, i) => {
			// taper: each row narrows from the previous row's width down to its own pct
			const wTop = i === 0 ? 100 : Math.max(b.steps[i - 1].pct, 6);
			const wBot = Math.max(Math.min(s.pct, wTop), 6);
			const inTop = (100 - wTop) / 2, inBot = (100 - wBot) / 2;
			const clip = `polygon(${inTop}% 0, ${100 - inTop}% 0, ${100 - inBot}% 100%, ${inBot}% 100%)`;
			const drop = s.dropoff ? ` · <span class="od-fnl-d">▼${s.dropoff}%</span>` : '';
			return `<div class="od-fnl-row">
				<div class="od-fnl-nm">${frappe.utils.escape_html(s.label)}</div>
				<div class="od-fnl-bar-wrap">
					<div class="od-fnl-bar" style="clip-path:${clip};-webkit-clip-path:${clip};background:linear-gradient(135deg,${s.color},${s.color}cc);">
						<span class="od-fnl-val">${fmt(s)}</span>
					</div>
				</div>
				<div class="od-fnl-meta">${s.pct}%${drop}</div>
			</div>`;
		}).join('') + '</div>';
	}

	_funnel_svg(b) {
		if (!b.steps || !b.steps.length) return '<div class="od-empty" style="padding:20px;">No data</div>';
		const steps = b.steps;
		const cx = 300, maxHalf = 120, y0 = 24, h = 34, gap = 8;
		const top = Number(steps[0].value) || 1;
		const MIN = 0.18;  // floor so small stages stay visible
		const share = steps.map((s) => {
			const raw = (s.pct != null ? Number(s.pct) / 100 : Number(s.value) / top);
			return MIN + (1 - MIN) * Math.max(0, Math.min(1, raw));  // map 0..1 into MIN..1
		});
		const fmt = (s) => (s.money ? this._short(s.value) : Number(s.value || 0).toLocaleString('en-IN'));
		const cols = ['#3b6ef8', '#5a4fe0', '#7b3fd4', '#119b8b', '#1aa85f', '#16a34a'];
		const hasTgt = steps.some((s) => s.target != null);
		let defs = '', body = '';
		steps.forEach((s, i) => {
			const c1 = s.color || cols[i % cols.length];
			const c2 = (steps[i + 1] && steps[i + 1].color) || cols[(i + 1) % cols.length];
			defs += `<linearGradient id="odfg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
			const yT = y0 + i * (h + gap), yB = yT + h, yc = yT + h / 2 + 5;
			const tH = Math.max(share[i], 0.05) * maxHalf;
			const bShare = (i < steps.length - 1) ? share[i + 1] : share[i] * 0.8;
			const bH = Math.max(bShare, 0.04) * maxHalf;
			const lbl = frappe.utils.escape_html(s.label || '');

			// clickable group -> drills the stage
			body += `<g data-drill="stage" data-key="${lbl}" data-label="${lbl}" style="cursor:pointer">`;
			body += `<path d="M${cx - tH} ${yT} L${cx + tH} ${yT} L${cx + bH} ${yB} L${cx - bH} ${yB} Z" fill="url(#odfg${i})"/>`;
			body += `<text x="14" y="${yc}" class="od-fsv-nm">${lbl}</text>`;
			body += `<text x="${cx}" y="${yc}" text-anchor="middle" class="od-fsv-val">${fmt(s)}</text>`;
			if (s.count != null) body += `<text x="498" y="${yc}" class="od-fsv-cnt">${Number(s.count).toLocaleString('en-IN')}</text>`;
			if (s.dropoff) body += `<text x="592" y="${yc}" text-anchor="end" class="od-fsv-drop">▼${s.dropoff}%</text>`;
			if (s.target != null) {
				let tShare = (s.target_pct != null) ? Number(s.target_pct) / 100 : Number(s.target) / top;
				tShare = Math.min(Math.max(tShare, 0.05), 1.15);
				const tx = cx + tShare * maxHalf;
				body += `<line x1="${tx}" y1="${yT - 7}" x2="${tx}" y2="${yB + 1}" class="od-fsv-tgt"/>`;
				const tl = s.target_label || (s.money ? this._short(s.target) : Number(s.target).toLocaleString('en-IN'));
				body += `<text x="${tx}" y="${yT - 11}" text-anchor="middle" class="od-fsv-tgtlbl">Tgt ${frappe.utils.escape_html(tl)}</text>`;
			}
			body += `</g>`;
		});
		const vh = y0 + steps.length * (h + gap) + 6;
		const legend = `<div class="od-fsv-legend">${hasTgt ? `<span><span class="od-fsv-dash"></span> ${__('Stage target')}</span>` : ''}<span>${__('Bar width = share of top stage')}</span></div>`;
		return `<svg class="sd-funnel-svg" viewBox="0 0 600 ${vh}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${__('Sales stage funnel')}"><defs>${defs}</defs>${body}</svg>${legend}`;
	}


	_dual_donut(b) {
		return `<div class="od-dual">
			${this._mini_donut(b.left)}
			${this._mini_donut(b.right)}
		</div>`;
	}

	_mini_donut(d) {
		const segs = d.segments || [];
		const total = segs.reduce((a, s) => a + Number(s.value), 0) || 1;
		const r = 34, C = 2 * Math.PI * r;
		let off = 0, arcs = `<circle cx="46" cy="46" r="${r}" fill="none" stroke="#e0e5f2" stroke-width="12"/>`;
		segs.forEach((s) => {
			const len = (Number(s.value) / total) * C;
			arcs += `<circle cx="46" cy="46" r="${r}" fill="none" stroke="${s.color}" stroke-width="12" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 46 46)" data-drill="${d.title === __('Brand') ? 'brand' : 'item_group'}" data-key="${frappe.utils.escape_html(s.label)}" style="cursor:pointer"/>`;
			off += len;
		});
		const legend = segs.map((s) => {
			const pct = Math.round((Number(s.value) / total) * 1000) / 10;
			return `<div class="od-li" data-drill="${d.title === __('Brand') ? 'brand' : 'item_group'}" data-key="${frappe.utils.escape_html(s.label)}" style="cursor:pointer">
				<div class="od-ld" style="background:${s.color}"></div>
				<span class="od-ln">${frappe.utils.escape_html(s.label)}</span>
				<span class="od-lp">${pct}%</span></div>`;
		}).join('');
		return `<div class="od-mini">
			<div class="od-mini-t">${frappe.utils.escape_html(d.title)}</div>
			<svg width="92" height="92" viewBox="0 0 92 92">${arcs}
				<text x="46" y="49" text-anchor="middle" font-size="11" font-weight="800" fill="#141928" font-family="Syne">${this._short(d.total)}</text></svg>
			<div class="od-mini-leg">${legend}</div>
		</div>`;
	}


	_followup_strip(s) {
		return `<div class="od-fustrip" data-fu="open">
			<span class="od-fustrip-ic"><i class="ti ti-bell"></i></span>
			<span class="od-fustrip-seg danger"><b>${s.overdue}</b> ${__('Overdue')}</span>
			<span class="od-fustrip-seg"><b>${s.today}</b> ${__('Today')}</span>
			<span class="od-fustrip-seg"><b>${s.upcoming}</b> ${__('Upcoming')}</span>
			<span class="od-fustrip-go">${__('View all')} <i class="ti ti-chevron-right"></i></span>
		</div>`;
	}


	_openFollowups() {
		const content = this.$body.find('.od-content').html('<div class="od-empty">Loading…</div>');
		frappe.call({ method: `${OD_API}.get_followups`,
			args: { scope: this.scope, filters: JSON.stringify(this._lastFilters || {}) }
		}).then((r) => {
			const d = r.message || {};
			let html = `<button class="od-fu-back"><i class="ti ti-arrow-left"></i> ${__('Back to dashboard')}</button>`;
			(d.groups || []).forEach((g) => {
				if (!g.rows.length) return;
				html += `<div class="od-fu-group"><div class="od-fu-gh ${g.danger ? 'danger' : ''}">${g.label} · ${g.rows.length}</div>`;
				html += g.rows.map((it) => `<a class="od-fu-row" href="${it.link}">
					<span class="od-fu-ic"><i class="ti ${it.icon}"></i></span>
					<span class="od-fu-main"><span class="od-fu-t">${frappe.utils.escape_html(it.title)}</span>
					<span class="od-fu-when ${g.danger ? 'od' : ''}">${frappe.utils.escape_html(it.when)}</span></span>
					${it.status ? `<span class="od-fu-badge">${frappe.utils.escape_html(it.status)}</span>` : ''}</a>`).join('');
				html += `</div>`;
			});
			content.html(html);
			content.find('.od-fu-back').on('click', () => this._render_active());
		});
	}

	// ---- Quota attainment meter (image 1, left) ----
	_quota(b) {
		const pct = Math.max(0, Math.min(100, Number(b.pct) || 0));
		const pace = Math.max(0, Math.min(100, Number(b.pace) || 0));
		return `<div class="od-q2">
			<div class="od-q2-top">
				<div><div class="od-q2-lbl">${frappe.utils.escape_html(b.label || __('Quota attainment'))}</div>
					<div class="od-q2-pct">${pct}%</div>
					<div class="od-q2-of">${this._short(b.achieved)} ${__('of')} ${this._short(b.target)} ${__('target')}</div></div>
				<div class="od-q2-short"><div class="od-q2-lbl">${__('Shortfall')}</div><div class="v">${this._short(b.shortfall)}</div></div>
			</div>
			<div class="od-q2-meter">
				<div class="od-q2-flag" style="left:${pace}%"><b>${__('pace')}</b> ${pace}%</div>
				<div class="od-q2-track"><div class="od-q2-fill" style="width:${pct}%"></div>
					<div class="od-q2-line" style="left:${pace}%"></div></div>
				<div class="od-q2-foot"><span>${this._short(0)}</span><span>${this._short(b.target)}</span></div>
			</div></div>`;
	}

	// ---- Forecast headline (image 1, right) ----
	_forecast_card(b) {
		const sp = b.split ? `<div class="od-fc-split">
			<span class="nw"><i></i>${__('New')} ${this._short(b.split.new)}</span>
			<span class="rn"><i></i>${__('Renewal')} ${this._short(b.split.renewal)}</span>
		</div>` : '';
		return `<div class="od-fc">
			<div class="od-fc-big">${this._short(b.value)}</div>
			<div class="od-fc-cap">${frappe.utils.escape_html(b.caption || '')}</div>
			${sp}
			${b.coverage ? `<div class="od-fc-cov"><i class="ti ti-shield-check"></i> ${frappe.utils.escape_html(b.coverage)}</div>` : ''}</div>`;
	}

	// ---- Achieved vs Target grouped bars (image 2, left) ----
	_avt(b) {
		const items = b.items || [];
		const max = Math.max(b.target || 1, ...items.map((i) => i.achieved || 0), 1), H = 118;
		const tH = Math.round((b.target || 0) / max * H);
		const bars = items.map((m) => `<div class="od-avt-grp"><div class="od-avt-pair">
			<div class="od-avt-bar tg" style="height:${tH}px"></div>
			<div class="od-avt-bar ac" style="height:${Math.round((m.achieved || 0) / max * H)}px"></div></div>
			<span>${frappe.utils.escape_html(m.label)}</span></div>`).join('');
		return `<div class="od-avt-legend"><span><i class="tg"></i>${__('Target')}</span><span><i class="ac"></i>${__('Achieved')}</span></div>
			<div class="od-avt">${bars}</div>`;
	}

	// ---- Activity list (image 2, right) ----
	_actlist(b) {
		return '<div class="od-act">' + (b.rows || []).map((r) =>
			`<div class="od-act-row od-clk2" data-drill="${r.drill || 'activity'}" data-key="${frappe.utils.escape_html(r.key || '')}" data-label="${frappe.utils.escape_html(r.label)}">
				<span class="lab"><i class="ti ${r.icon}"></i>${frappe.utils.escape_html(r.label)}</span>
				<span class="val ${r.warn ? 'w' : ''}">${frappe.utils.escape_html(String(r.value))}</span>
			</div>`).join('') + '</div>';
	}

	// ---- Why deals are lost (image 3, left) ----
	_lostbars(b) {
		return '<div class="od-lr">' + (b.rows || []).map((r) =>
			`<div class="od-lr-row"><div class="od-lr-top"><span>${frappe.utils.escape_html(r.label)}</span><span class="p">${r.pct}%</span></div>
			<div class="od-lr-bar" style="width:${r.pct}%"></div></div>`).join('') + '</div>';
	}

	// ---- Stalled / Quotes: big number + sub rows (images 3 & 4, right) ----
	_statlist(b) {
		const rows = (b.rows || []).map((r) =>
			`<div class="od-sl-row"><span class="k">${frappe.utils.escape_html(r.label)}</span><span class="v ${r.warn ? 'w' : ''}">${frappe.utils.escape_html(String(r.value))}</span></div>`).join('');
		return `<div class="od-sl"><div class="od-sl-big"><span class="n ${b.danger ? 'r' : ''}">${frappe.utils.escape_html(String(b.big))}</span>
			<span class="x">${frappe.utils.escape_html(b.caption || '')}</span></div>${rows}</div>`;
	}

	// ---- Renewals due 30/60/90 + flag (image 4, left) ----
	
	_renewals(b) {
		const keys = ['expired', 30, 60, 90];
		const cells = (b.buckets || []).map((c, i) =>
			`<div data-drill="renewals" data-key="${keys[i]}" style="cursor:pointer">
				<div class="n ${c.danger ? 'r' : ''}">${frappe.utils.escape_html(String(c.value))}</div>
				<div class="l">${frappe.utils.escape_html(c.label)}</div></div>`).join('');
		return `<div class="od-rn"><div class="od-rn-row">${cells}</div>
			${b.flag ? `<div class="od-rn-flag"><i class="ti ti-alert-triangle"></i> ${frappe.utils.escape_html(b.flag)}</div>` : ''}</div>`;
	}

	_heatmap(b) {
		const shade = (v) => {
			if (!v) return 'background:var(--s3);color:transparent;';
			const t = Math.min(v / b.max, 1);
			const bg = `rgba(47,77,224,${(0.15 + t * 0.75).toFixed(2)})`;
			return `background:${bg};color:${t > 0.5 ? '#fff' : 'var(--ts)'};`;
		};
		const cols = `<div style="display:flex;gap:4px;margin-left:50px;margin-bottom:6px;">${
			b.cols.map((c) => `<div style="width:34px;text-align:center;font-size:10px;color:var(--mu);font-weight:600;">${c}</div>`).join('')}</div>`;
		const rows = b.rows.map((r) => `
			<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
				<div style="width:46px;font-size:11px;color:var(--m2);text-align:right;font-weight:500;">${r.label}</div>
				<div style="display:flex;gap:4px;">${r.cells.map((v) => `
					<div title="${v} ${__('created')}" style="width:34px;height:28px;border-radius:5px;display:grid;place-items:center;font-size:11px;font-weight:700;${shade(v)}">${v || ''}</div>`).join('')}</div>
			</div>`).join('');
		const legend = `<div style="display:flex;align-items:center;gap:6px;margin-top:12px;font-size:11px;color:var(--mu);">
			<span>${__('Less')}</span>
			${[0.05, 0.3, 0.55, 0.8, 1].map((t) => `<span style="width:14px;height:14px;border-radius:3px;background:rgba(47,77,224,${(0.15 + t * 0.75).toFixed(2)});"></span>`).join('')}
			<span>${__('More')}</span></div>`;
		return cols + rows + legend;
	}

	_gauge(b) {
		const val = Number(b.value) || 0, max = Number(b.max) || 100;
		const pct = Math.max(0, Math.min(1, val / max));
		const len = Math.PI * 50;
		return `<div style="display:flex;flex-direction:column;align-items:center;padding:6px 0;">
			<svg viewBox="0 0 120 74" width="160">
				<path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="var(--s3)" stroke-width="13" stroke-linecap="round"/>
				<path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="${b.color || '#2f4de0'}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${len * pct} ${len}"/>
				<text x="60" y="56" text-anchor="middle" font-size="22" font-weight="800" fill="#141928" font-family="Syne">${Math.round(val * 10) / 10}${b.suffix || ''}</text>
			</svg>
			${b.caption ? `<div style="font-size:11.5px;color:var(--mu);margin-top:4px;">${frappe.utils.escape_html(b.caption)}</div>` : ''}
		</div>`;
	}

	_hbars(b) {
		if (!b.bars || !b.bars.length) return '<div class="od-empty" style="padding:20px;">No data</div>';
		return '<div class="od-hb">' + b.bars.map((x) => {
			const val = x.money ? this._short(x.value) : Number(x.value).toLocaleString('en-IN');
			return `<div class="od-hbi"><div class="od-hbm"><span class="od-hbn">${frappe.utils.escape_html(x.label)}</span><span class="od-hbv" style="color:${x.color}">${val}</span></div><div class="od-hbt"><div class="od-hbf" style="width:${x.pct}%;background:${x.color}"></div></div></div>`;
		}).join('') + '</div>';
	}

	_table(b) {
		if (!b.rows || !b.rows.length) return '<div class="od-empty" style="padding:20px;">No data</div>';
		const head = b.columns.map((c, i) => `<th >${frappe.utils.escape_html(c)}</th>`).join('');
		const body = b.rows.map((row) => '<tr>' + row.map((cell, i) => {
			if (cell.spark) {
				const sp = this._spark(cell.spark, cell.color || '#2f4de0');
				return `<td>${sp}</td>`;
			}
			if (cell.stack) {
				const lines = cell.stack.map((s) => {
					const st = [];
					if (s.strong) st.push('font-weight:600;color:var(--tx)');
					if (s.muted) st.push('color:var(--mu);font-size:11.5px');
					if (s.accent) st.push('color:var(--ac);font-weight:700');
					if (s.color) st.push(`color:${s.color};font-weight:600;font-size:11.5px`);
					const txt = frappe.utils.escape_html(String(s.t));
					const inner = s.link ? `<a class="od-a" href="${s.link}">${txt}</a>` : txt;
					return `<div style="${st.join(';')};line-height:1.4;">${inner}</div>`;
				}).join('');
				return `<td>${lines}</td>`;
			}
			if (cell.chips) {
				const chips = cell.chips.map((c) =>
					`<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:600;color:${c.color};background:${c.color}1a;margin:1px 3px 1px 0;white-space:nowrap;">${frappe.utils.escape_html(String(c.t))}</span>`
				).join('');
				return `<td>${chips}</td>`;
			}
			let v = cell.v;
			if (cell.money) v = this._short(v);
			else if (cell.pct) v = `${Math.round(Number(v) * 10) / 10}%`;
			else if (typeof cell.v === "string" && cell.v.includes("<br>")) {
				v = cell.v; // allow HTML
			} else {
				v = frappe.utils.escape_html(String(v));
			}
			
			let inner = v;
			if (cell.avatar) inner = `<span class="od-av">${this._initials(cell.v)}</span>${frappe.utils.escape_html(cell.v)}`;
			else if (cell.link) inner = `<a class="od-a" href="${cell.link}">${frappe.utils.escape_html(cell.v)}</a>`;
			else if (cell.bar !== undefined) inner = `<span class="od-sbar"><span class="od-sfill" style="width:${cell.bar}%"></span></span>${v}`;
			const style = [];
			if (cell.color) style.push(`color:${cell.color}`);
			if (cell.bold) style.push('font-weight:700;color:var(--tx)');
			if (cell.muted) style.push('color:var(--mu)');
			return `<td lass="${(i >= 1 && i !== 1) ? 'od-r' : ''}" style="${style.join(';')}">${inner}</td>`;
		}).join('') + '</tr>').join('');
		return `<div style="overflow-x:auto;"><table class="od-tbl${b.fixed ? ' od-fixed' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
	}

	_initials(s) { return (s || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(); }
	_spark(vals, color) {
		const v = (vals || []).map(Number);
		if (!v.length) return '';
		const max = Math.max(...v, 1), W = 70, H = 22;
		const pts = v.map((x, i) => `${(i * W) / Math.max(v.length - 1, 1)},${H - 2 - (x / max) * (H - 4)}`).join(' ');
		return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="vertical-align:middle;"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	}
	_fmt(v, t) {
		if (t === 'Currency') return this._short(v);
		if (t === 'Percent') return `${Math.round(Number(v) * 10) / 10}%`;
		if (t === 'Int') return Number(v || 0).toLocaleString('en-IN');
		return frappe.utils.escape_html(String(v));
	}
	_short(v) {
		v = Number(v || 0);
		if (v >= 1e7) return '₹' + (v / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
		if (v >= 1e5) return '₹' + (v / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
		return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
	}


	_followups(b) {
		if (!b.rows || !b.rows.length) return '<div class="od-empty" style="padding:20px;">No follow-ups</div>';
		const tcol = {call:'#2f4de0', appointment:'#0b8c78', task:'#7c3aed'};
		return '<div class="od-fu">' + b.rows.map((r) => `
			<a class="od-fu-row" href="${r.link}">
				<span class="od-fu-ic" style="color:${tcol[r.type]||'#68748f'}"><i class="ti ${r.icon}"></i></span>
				<span class="od-fu-main">
					<span class="od-fu-t">${frappe.utils.escape_html(r.title)}</span>
					<span class="od-fu-when ${r.overdue ? 'od' : ''}">${frappe.utils.escape_html(r.when)}</span>
				</span>
				${r.status ? `<span class="od-fu-badge">${frappe.utils.escape_html(r.status)}</span>` : ''}
			</a>`).join('') + '</div>';
	}
}