frappe.pages['job-recruitment'].on_page_load = function (wrapper) {
	new jobrecruitmentpage(wrapper);
};

// };
frappe.pages['job-recruitment'].on_page_show = function (wrapper) {
	//console.log("🔄 Tickets page showing", wrapper);
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
			if (!frappe.job_recruitment_page || frappe.job_recruitment_page.wrapper !== pageWrapper) {
				frappe.job_recruitment_page = new jobrecruitmentpage(pageWrapper);
			}
			frappe.job_recruitment_page.render();
		});
	});
};

class jobrecruitmentpage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Job Recruitment',
			single_column: true
		});
	}
	render() {
		const $content = $("#support-page-content");
		if (!$content.length) {
			console.error("❌ support-page-content not found - layout may not be loaded yet");
			// Try again in a moment
			setTimeout(() => this.render(), 100);
			return;
		}
		const hasApp = $content.find("#job-recruitment-app").length > 0;
		if (!hasApp) {
			$content.empty().append(frappe.job_recruitment_page_template.body);
		}
		if (!frappe.job_recruitment_initialized) {
			initJobRecruitmentPage();
			frappe.job_recruitment_initialized = true;
		} else if (typeof frappe.job_recruitment_refresh === "function") {
			frappe.job_recruitment_refresh();
		}
		this.setActiveSidebar();
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "support-dashboard-te"

		// Reset states - use new class names
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		$(".menu-parent").removeClass("active");

		// Use data-page for reliable matching
		$(".side-nav-link[data-page]").each((index, element) => {
			const $link = $(element);
			const linkPage = $link.data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				// Highlight the current link
				$link.addClass("active-menu");

				// Mark the item as active
				const $item = $link.closest(".side-nav-item");
				$item.addClass("active-menu-item");

				// Open all parent menus
				const $parent = $link.closest(".menu-parent");
				if ($parent.length) {
					$parent.addClass("active");

					// Also open any ancestor menus
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
}

frappe.job_recruitment_page_template = {
	body: `
	<div id="job-recruitment-app" class="job-recruitment-container">
		<!-- Navigation Tabs -->
		<div class="jp-nav-bar design-2">
			<div class="nav-container">
				<button class="nav-tab active" data-screen="requirements">
					<span class="nav-label">Requirements</span>
				</button>
				<button class="nav-tab" data-screen="candidates">
					<span class="nav-label">Candidates</span>
				</button>
				<div class="nav-spacer"></div>
				<button id="req-new" type="button" class="btn-create-job nav-action-btn" data-action="create-job">
					<i class="nav-icon">➕</i>
					<span class="nav-label">Create Job</span>
				</button>
				<button id="add-candidate" type="button" class="btn-create-job btn-add-candidate nav-action-btn" data-action="add-candidate" style="display:none;">
					<i class="nav-icon">➕</i>
					<span class="nav-label">Add Candidate</span>
				</button>
			</div>
		</div>

		<!-- Screen 1: Requirements & Pipeline -->
		<div id="screen-requirements" class="jp-screen active">
			<!-- Header Section -->
			<!-- Header Section (compact) -->
			<div class="jp-header" style="padding:12px 0;background:transparent;box-shadow:none;display:none;">
				<div class="jp-header-content" style="gap:8px;justify-content:flex-end;">
					<button id="req-new-old" type="button" class="btn btn-primary btn-lg">+ Create Job Requirement</button>
				</div>
			</div>

			<!-- Premium Analytics Dashboard -->
			<div class="dashboard-metrics">
				<div class="metric-card metric-blue">
					<div class="metric-icon">💼</div>
					<div class="metric-content">
						<div class="metric-label">Total Jobs</div>
						<div class="metric-value" id="dash-total-jobs">0</div>
					</div>
				</div>
				<div class="metric-card metric-green">
					<div class="metric-icon">📈</div>
					<div class="metric-content">
						<div class="metric-label">Open Positions</div>
						<div class="metric-value" id="dash-open-pos">0</div>
					</div>
				</div>
				<div class="metric-card metric-purple">
					<div class="metric-icon">👥</div>
					<div class="metric-content">
						<div class="metric-label">Total Candidates</div>
						<div class="metric-value" id="dash-total-cands">0</div>
					</div>
				</div>
				<div class="metric-card metric-orange">
					<div class="metric-icon">✅</div>
					<div class="metric-content">
						<div class="metric-label">Selected</div>
						<div class="metric-value" id="dash-selected">0</div>
					</div>
				</div>
			</div>

			<div class="jp-grid">
				<!-- Left Sidebar -->
				<aside class="jp-side">
					<div class="card jp-card jp-card-premium">
						<div class="card-header jp-header-sidebar">
							
							<div>
								<h3>Active Openings</h3>
							</div>
						</div>
						<div class="card-body">
							<input id="req-search" class="input jp-input-search" placeholder=" Search requirements...">
							<div id="req-list" class="req-list"></div>
						</div>
					</div>
				</aside>

				<!-- Main Content Area -->
				<main class="jp-main">
					<!-- Selected Requirement Card -->
					<div class="card jp-card jp-card-premium">
						<div class="card-header jp-header-detail">
							
							<div>
								<h3>Requirement Details</h3>
								
							</div>
						</div>
						<div class="card-body" id="selected-requirement">
							<div class="jp-empty-state">
								<div class="empty-icon">👈</div>
								<p>Select a requirement to view details</p>
							</div>
						</div>
					</div>

					<!-- Pipeline Snapshot Card -->
					<div class="card jp-card jp-card-premium mt-24">
						<div class="card-header jp-header-pipeline">
							
							<div>
								<h3>Candidate  Pipeline</h3>
								
							</div>
						</div>
						<div class="card-body" id="pipeline-snapshot">
							<div class="jp-empty-state"><p>No data</p></div>
						</div>
					</div>

					<!-- Pipeline Candidate Profiles Card -->
					<div class="card jp-card jp-card-premium mt-24">
						<div class="card-header jp-header-pipeline">
							
							<div>
								<p id="pipeline-cand-subheader">Select a status to view candidates</p>
							</div>
						</div>
						<div class="card-body" id="pipeline-candidates-list">
							<div class="jp-empty-state"><p>Click a status in the pipeline above</p></div>
						</div>
					</div>
				</main>
			</div>
		</div>

		<!-- Screen 2: Candidates Management -->
		<div id="screen-candidates" class="jp-screen">
			<!-- Compact Header (only Add Candidate) -->
			<div class="jp-header" style="padding:12px 0;background:transparent;box-shadow:none;display:none;">
				<div class="jp-header-content" style="gap:8px;justify-content:flex-end;">
					<button id="add-candidate-old" type="button" class="btn btn-success btn-lg">+ Add Candidate</button>
				</div>
			</div>

			<!-- Mirror Requirements layout: left sidebar list, main detail area -->
			<div class="jp-grid">
				<aside class="jp-side">
					<div class="card jp-card">
						<div class="card-header jp-header-candidates">
							<div><h3>Candidates</h3></div>
						</div>
						<div class="card-body">
							<input id="cand-search" class="input jp-input-search" placeholder=" Search candidates...">
							<div id="candidate-list" class="candidate-list"></div>
							<div id="candidate-pagination" class="pagination jp-pagination"></div>
						</div>
					</div>
				</aside>

				<main class="jp-main">
					<div id="candidate-detail-panel" class="card jp-card jp-card-premium">
						<div class="card-header jp-header-detail">
							<div><h3 id="candidate-detail-sub" style="margin:0;color:#000000;font-size:14px;">No candidate selected</h3></div>
						</div>
						<div class="card-body" id="candidate-detail-body">
							<div class="jp-empty-state" style="padding:80px 40px;text-align:center;">
								<div style="font-size:20px;margin-bottom:16px;">👤</div>
								<p style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:8px;">No Candidate Selected Yet</p>
								<p style="font-size:14px;color:#6b7280;line-height:1.6;">Click on a candidate name from the list to view their profile, experience, skills, and status.</p>
							</div>
						</div>
					</div>
				</main>
			</div>

		</div>
	</div>

	<!-- Modal Root - OUTSIDE main container for proper z-index handling -->
	<div id="modal-root" class="modal-root" style="display:none"></div>
`
};

function initJobRecruitmentPage() {

	// If the HTML content exists in the page already (we added job_recruitment.html), skip creating elements
	// Setup keys
	var REQ_KEY = 'job_reqs_demo_v2';
	var CAND_KEY = 'job_cands_demo_v2';
	var SELECTED_KEY = 'job_selected_req_v2';

	// UI state: pipeline filter ('' = none)
	var PIPELINE_FILTER = '';
	var CURRENT_SCREEN = 'requirements'; // Track current screen

	// Screen navigation function
	function switchScreen(screenName) {
		CURRENT_SCREEN = screenName;
		var screens = document.querySelectorAll('.jp-screen');
		screens.forEach(function (s) { s.classList.remove('active'); });
		var target = document.getElementById('screen-' + screenName);
		if (target) target.classList.add('active');

		// Update nav tab active state
		var tabs = document.querySelectorAll('.nav-tab');
		tabs.forEach(function (t) { t.classList.remove('active'); });
		var activeTab = document.querySelector('.nav-tab[data-screen="' + screenName + '"]');
		if (activeTab) activeTab.classList.add('active');

		// Show/hide action buttons based on active screen
		var createJobBtn = document.getElementById('req-new');
		var addCandidateBtn = document.getElementById('add-candidate');

		if (screenName === 'requirements') {
			if (createJobBtn) createJobBtn.style.display = 'flex';
			if (addCandidateBtn) addCandidateBtn.style.display = 'none';
		} else if (screenName === 'candidates') {
			if (createJobBtn) createJobBtn.style.display = 'none';
			if (addCandidateBtn) addCandidateBtn.style.display = 'flex';
		}
	}

	function loadReqs() { try { return JSON.parse(localStorage.getItem(REQ_KEY) || '[]'); } catch (e) { return [] } }
	function saveReqs(r) { localStorage.setItem(REQ_KEY, JSON.stringify(r)); }
	function loadCands() { try { return JSON.parse(localStorage.getItem(CAND_KEY) || '[]'); } catch (e) { return [] } }
	function saveCands(c) { localStorage.setItem(CAND_KEY, JSON.stringify(c)); }
	function loadSelected() { return parseInt(localStorage.getItem(SELECTED_KEY)); }
	function saveSelected(i) { localStorage.setItem(SELECTED_KEY, (i === undefined || i === null) ? '' : String(i)); }

	// Seed demo data when empty
	if (!loadReqs().length) {
		saveReqs([
			{ title: 'Sales Executive', dept: 'Sales', location: 'Bengaluru', type: 'Full-Time', experience: '1-3 yrs', description: 'Reporting to Sales Manager. Communication, Negotiation, CRM.', salary: '3L - 4L', posted: new Date().toISOString() },
			{ title: 'Senior Developer', dept: 'Engineering', location: 'Remote', type: 'Full-Time', experience: '4-8 yrs', description: 'Full stack JS. React/Node experience.', salary: '12L - 18L', posted: new Date().toISOString() }
		]);
	}
	if (!loadCands().length) {
		saveCands([
			{ name: 'Amit Sharma', phone: '+91 3855796822', email: 'amit.sharma@example.com', years: 3, expected: '₹645,151', skills: 'JavaScript, React', status: 'Selected', reqTitle: 'Sales Executive' },
			{ name: 'Neha Singh', phone: '+91 9988776655', email: 'neha.s@example.com', years: 1, expected: '₹250,272', skills: 'Sales, CRM', status: 'Applied', reqTitle: 'Sales Executive' },
			{ name: 'Ravi Kumar', phone: '+91 9876543210', email: 'ravi.k@example.com', years: 5, expected: '₹1,200,000', skills: 'Node, React', status: 'Rejected', reqTitle: 'Senior Developer' }
		]);
	}

	// Utility renderers
	function formatReqItem(r, idx) {
		// Premium requirement item (no emoji icons). Left accent bar handled in CSS via ::before.
		var title = r.title || 'Untitled';
		var location = r.location || 'Location TBD';
		var dept = r.dept || 'Department';
		var type = r.type || 'Type';

		return '<div class="req-item" data-idx="' + idx + '">' +
			'<div class="req-left">' +
			'<div class="req-title">' + title + '</div>' +
			'<div class="req-meta">' + location + ' • ' + dept + ' • ' + type + '</div>' +
			'</div>' +
			'</div>';
	}

	function renderReqList(filter) {
		var list = loadReqs();
		var selected = loadSelected();
		var container = document.getElementById('req-list'); if (!container) return;
		container.innerHTML = '';
		list.forEach(function (r, idx) {
			if (filter && !((r.title || '').toLowerCase().includes(filter) || (r.dept || '').toLowerCase().includes(filter))) return;
			container.insertAdjacentHTML('beforeend', formatReqItem(r, idx));
		});
		container.querySelectorAll('.req-item').forEach(function (el) {
			var idx = parseInt(el.getAttribute('data-idx'));
			if (idx === selected) {
				el.classList.add('active');
			}
			el.addEventListener('click', function () {
				var i = parseInt(this.getAttribute('data-idx'));
				// Remove active class from all items
				container.querySelectorAll('.req-item').forEach(function (item) {
					item.classList.remove('active');
				});
				// Add active class to clicked item
				this.classList.add('active');
				saveSelected(i); renderSelectedRequirement(); renderCandidateList(); renderPipelineSnapshot(); updateDashboardMetrics();
			});
		});
	}

	function renderSelectedRequirement() {
		var sel = loadSelected();
		var reqCont = document.getElementById('selected-requirement'); if (!reqCont) return;
		var reqs = loadReqs();
		if (isNaN(sel) || !reqs[sel]) {
			reqCont.innerHTML = '<div class="jp-empty-state"><div class="empty-icon">👈</div><p>Select a requirement from the left</p></div>';
			return;
		}
		var r = reqs[sel];
		// Prepare experience and salary display (support min/max or legacy single-field)
		var expDisplay = '';
		if (r.experience_min || r.experience_max) {
			expDisplay = ((r.experience_min || '') + (r.experience_min && r.experience_max ? ' - ' : '') + (r.experience_max || '')) + (r.experience_min || r.experience_max ? ' yrs' : '');
		} else {
			expDisplay = r.experience || 'N/A';
		}
		var salaryDisplay = '';
		if (r.salary_min || r.salary_max) {
			salaryDisplay = (r.salary_min ? r.salary_min : '') + (r.salary_min && r.salary_max ? ' - ' : '') + (r.salary_max ? r.salary_max : '');
		} else {
			salaryDisplay = r.salary || 'N/A';
		}
		var salaryNote = (r.salary_public === false) ? '<div style="font-size:12px;color:#9ca3af;margin-top:6px;">Salary not published</div>' : '';
		var skillsDisplay = '';
		if (Array.isArray(r.skills)) skillsDisplay = r.skills.join(', ');
		else skillsDisplay = (r.skills || '');
		reqCont.innerHTML = '<div style="padding:0;">' +
			'<div style="margin-bottom:20px;">' +
			'<h2 style="margin:0;font-size:18px;font-weight:800;">' + r.title + '</h2>' +
			'<p style="margin:6px 0 0 0;color:#6b7280;font-size:13px;">' + r.dept + ' • ' + r.location + '</p>' +
			'</div>' +
			'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">' +
			'<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Location</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + r.location + '</div>' +
			'</div>' +
			'<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Experience</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + expDisplay + '</div>' +
			'</div>' +
			'<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Type</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + r.type + '</div>' +
			'</div>' +
			'<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Salary</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + salaryDisplay + '</div>' + salaryNote +
			'</div>' +
			'</div>' +
			(skillsDisplay ? '<div style="margin-bottom:16px;">' +
				'<h4 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#000000;">Required Skills</h4>' +
				'<div style="padding:10px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;font-size:13px;color:#000000;">' + skillsDisplay + '</div>' +
				'</div>' : '') +
			(r.reporting_to ? '<div style="margin-bottom:16px;">' +
				'<h4 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#000000;">Reports To</h4>' +
				'<div style="padding:10px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;font-size:13px;color:#000000;">' + r.reporting_to + '</div>' +
				'</div>' : '') +
			(r.description ? '<div style="margin-bottom:16px;">' +
				'<h4 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#000000;">Description</h4>' +
				'<div style="padding:10px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;font-size:13px;line-height:1.5;color:#000000;">' + r.description + '</div>' +
				'</div>' : '') +
			'<div class="req-panel-actions" style="display:flex;gap:8px;">' +
			'<button id="btn-edit-req" class="btn btn-secondary btn-sm">Edit</button>' +
			'<button id="btn-delete-req" class="btn btn-danger btn-sm">Delete</button>' +
			'</div>' +
			'</div>'

		// wire quick actions
		setTimeout(function () {
			var e = document.getElementById('btn-edit-req'); if (e) e.addEventListener('click', function () { openEditRequirementForm(sel); });
			var d = document.getElementById('btn-delete-req'); if (d) d.addEventListener('click', function () {
				if (!confirm('Delete this requirement and all linked candidates?')) return;
				var reqs = loadReqs(); var title = reqs[sel] && reqs[sel].title;
				reqs.splice(sel, 1); saveReqs(reqs); saveSelected(null);
				// remove linked candidates
				if (title) { var list = loadCands().filter(function (c) { return c.reqTitle !== title; }); saveCands(list); }
				renderReqList(); renderSelectedRequirement(); renderCandidateList(); renderPipelineSnapshot(); updateDashboardMetrics();
			});
		}, 10);
	}

	function openEditRequirementForm(idx) {
		var modal = document.getElementById('modal-root');
		if (!modal) {
			console.error('[job-posting] modal-root element not found!');
			frappe.msgprint('Error: Modal element not found');
			return;
		}

		// Display modal immediately with all necessary styles - ensure always visible
		modal.style.display = 'flex';
		modal.style.visibility = 'visible';
		modal.style.opacity = '1';
		modal.style.pointerEvents = 'auto';
		modal.style.zIndex = '99999';
		console.log('[job-posting] modal display properties set', modal);

		var existing = (typeof idx === 'number') ? loadReqs()[idx] : null;
		// try to normalize legacy experience field
		var legacyExpMin = '';
		var legacyExpMax = '';
		if (existing && existing.experience && typeof existing.experience === 'string') {
			var m = existing.experience.match(/(\d+)\s*-\s*(\d+)/);
			if (m) { legacyExpMin = m[1]; legacyExpMax = m[2]; }
		}
		modal.innerHTML = '<div class="modal-backdrop" id="modal-backdrop"></div>' +
			'<div class="modal-panel">' +
			'<div>' + (existing ? 'Edit Requirement' : 'Create Requirement') + '</div>' +
			'<div class="section-label">Position Details</div>' +
			'<label>Job Title</label>' +
			'<input id="r-title" class="input" placeholder="e.g., Senior Software Engineer" value="' + (existing ? existing.title : '') + '">' +
			'<label>Department</label>' +
			'<select id="r-dept" class="input">' +
			'<option value="">Select department</option>' +
			'<option value="Technical" ' + (existing && existing.dept === 'Technical' ? 'selected' : '') + '>Technical</option>' +
			'<option value="Business executive" ' + (existing && existing.dept === 'Business executive' ? 'selected' : '') + '>Business executive</option>' +
			'</select>' +
			'<div class="row-flex"><div style="flex:1"><label>Location</label><input id="r-location" class="input" placeholder="City, Country" value="' + (existing ? existing.location : '') + '"></div><div style="flex:1"><label>Employment Type</label><input id="r-type" class="input" placeholder="Full-Time" value="' + (existing ? existing.type : 'Full-Time') + '"></div></div>' +
			'<label>Reports To</label>' +
			'<input id="r-reporting" class="input" placeholder="Manager title" value="' + (existing ? existing.reporting_to : '') + '">' +
			'<div class="section-label">Experience &amp; Compensation</div>' +
			'<label>Required Experience</label>' +
			'<div class="row-flex"><input id="r-experience-min" class="input" placeholder="Min (yrs)" value="' + (existing ? (existing.experience_min || legacyExpMin) : '') + '"><input id="r-experience-max" class="input" placeholder="Max (yrs)" value="' + (existing ? (existing.experience_max || legacyExpMax) : '') + '"></div>' +
			'<label>Salary Range</label>' +
			'<div class="row-flex"><input id="r-salary-min" class="input" placeholder="Min salary" value="' + (existing ? (existing.salary_min || '') : '') + '"><input id="r-salary-max" class="input" placeholder="Max salary" value="' + (existing ? (existing.salary_max || '') : '') + '"></div>' +
			'<label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-weight:600;"><input type="checkbox" id="r-salary-public" ' + (existing && existing.salary_public ? 'checked' : '') + '> <span>Make salary visible to candidates</span></label>' +
			'<div class="section-label">Required Skills</div>' +
			'<div id="r-skills-tags"></div>' +
			'<input id="r-skill-input" class="input" placeholder="Add skill (press Enter)">' +
			'<div class="section-label">Job Description</div>' +
			'<div id="r-desc-editor" style="min-height:300px;margin-bottom:14px;"></div>' +
			'<div style="display:flex;gap:10px;justify-content:flex-end;"><button id="r-cancel" class="btn btn-secondary">Cancel</button><button id="r-save" class="btn btn-primary">Save Requirement</button></div>';

		// Close on backdrop click - MUST be after innerHTML is set
		setTimeout(function () {
			try {
				var backdrop = document.getElementById('modal-backdrop');
				var cancelBtn = document.getElementById('r-cancel');
				if (backdrop) backdrop.addEventListener('click', function () { modal.style.display = 'none'; });
				if (cancelBtn) cancelBtn.addEventListener('click', function () { modal.style.display = 'none'; });
			} catch (e) {
				console.warn('Error attaching modal events', e);
			}
		}, 10);

		// Initialize skills spinner
		(function () {
			var suggestions = ['JavaScript', 'React', 'Node', 'Python', 'Django', 'Sales', 'CRM', 'SQL', 'DevOps', 'Design'];
			var tagsContainer = document.getElementById('r-skills-tags');
			var input = document.getElementById('r-skill-input');
			function addTag(val) {
				val = (val || '').trim(); if (!val) return;
				// avoid duplicates
				var existingChips = Array.prototype.slice.call(tagsContainer.querySelectorAll('.skill-chip')).map(function (n) { return n.getAttribute('data-skill').toLowerCase(); });
				if (existingChips.indexOf(val.toLowerCase()) !== -1) return;
				var chip = document.createElement('div'); chip.className = 'skill-chip'; chip.setAttribute('data-skill', val); chip.style.padding = '6px 8px'; chip.style.background = '#eef2ff'; chip.style.borderRadius = '999px'; chip.style.fontSize = '13px'; chip.style.display = 'inline-flex'; chip.style.alignItems = 'center'; chip.style.gap = '8px';
				chip.innerHTML = '<span>' + val + '</span><button class="chip-del" style="background:transparent;border:none;cursor:pointer">✕</button>';
				tagsContainer.insertBefore(chip, input);
				chip.querySelector('.chip-del').addEventListener('click', function () { chip.remove(); });
			}
			// populate from existing
			if (existing && existing.skills) {
				if (Array.isArray(existing.skills)) existing.skills.forEach(addTag);
				else existing.skills.split(/,\s*/).forEach(addTag);
			}
			input.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(this.value); this.value = ''; } });
		})();

		// Initialize Rich Text Editor - Frappe Native Text Editor
		(function () {
			// Initialize immediately without delay for faster UI response
			var editorEl = document.getElementById('r-desc-editor');
			if (!editorEl) return;

			try {
				// Use Frappe's native text editor field initialization
				var control = frappe.ui.form.make_control({
					parent: editorEl,
					df: {
						fieldname: 'description',
						fieldtype: 'Text Editor',
						default: (existing && existing.description) ? existing.description : ''
					},
					doc: {},
					only_input: true,
					value: (existing && existing.description) ? existing.description : ''
				});
				control.refresh();
				window._frappe_editor = control;
				window._editor_type = 'frappe_native';
			} catch (e) {
				console.warn('Frappe editor init failed, using fallback', e);
				// Fallback to contenteditable
				editorEl.contentEditable = true;
				editorEl.style.outline = '1px solid #ccc';
				editorEl.style.minHeight = '300px';
				editorEl.style.padding = '12px';
				editorEl.style.border = '1px solid #ccc';
				editorEl.style.borderRadius = '4px';
				editorEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
				if (existing && existing.description) {
					editorEl.innerHTML = existing.description;
				}
				window._editor_type = 'contenteditable';
			}
		})();


		// Save handler
		setTimeout(function () {
			try {
				var saveBtn = document.getElementById('r-save');
				if (saveBtn) {
					saveBtn.addEventListener('click', function () {
						var title = document.getElementById('r-title').value.trim(); if (!title) { frappe.msgprint('Title required'); return; }
						var reqs = loadReqs();
						// collect skills from chips
						var skillsEls = Array.prototype.slice.call(document.querySelectorAll('#r-skills-tags .skill-chip'));
						var skillsArr = skillsEls.map(function (el) { return el.getAttribute('data-skill'); });
						// collect description html from appropriate editor
						var descHtml = '';
						if (window._editor_type === 'frappe_native' && window._frappe_editor) {
							// Get from Frappe native editor
							descHtml = window._frappe_editor.get_value() || '';
						} else {
							// Fallback: get from contenteditable or DOM
							var editor = document.getElementById('r-desc-editor');
							if (editor) descHtml = editor.innerHTML.trim();
						}
						var obj = {
							title: title,
							dept: document.getElementById('r-dept').value.trim(),
							location: document.getElementById('r-location').value.trim(),
							type: document.getElementById('r-type').value.trim(),
							experience_min: (document.getElementById('r-experience-min') || { value: '' }).value.trim(),
							experience_max: (document.getElementById('r-experience-max') || { value: '' }).value.trim(),
							reporting_to: document.getElementById('r-reporting').value.trim(),
							skills: skillsArr,
							salary_min: (document.getElementById('r-salary-min') || { value: '' }).value.trim(),
							salary_max: (document.getElementById('r-salary-max') || { value: '' }).value.trim(),
							salary_public: (document.getElementById('r-salary-public') || { checked: false }).checked,
							description: descHtml,
							posted: new Date().toISOString()
						};
						if (existing) { reqs[idx] = obj; } else { reqs.push(obj); }
						saveReqs(reqs); modal.style.display = 'none'; renderReqList(); renderSelectedRequirement(); renderPipelineSnapshot(); updateDashboardMetrics();
					});
				}
			} catch (e) {
				console.warn('Error attaching save handler', e);
			}
		}, 10);
	}

	function updateDashboardMetrics() {
		// Update dashboard KPI cards with current data
		var reqs = loadReqs(); var cands = loadCands();
		var totalJobs = reqs.length;
		var openPositions = reqs.length;
		var totalCandidates = cands.length;
		var selectedCount = cands.filter(function (c) { return c.status === 'Selected'; }).length;

		var dashTotalJobs = document.getElementById('dash-total-jobs');
		var dashOpenPos = document.getElementById('dash-open-pos');
		var dashTotalCands = document.getElementById('dash-total-cands');
		var dashSelected = document.getElementById('dash-selected');

		if (dashTotalJobs) dashTotalJobs.textContent = totalJobs;
		if (dashOpenPos) dashOpenPos.textContent = openPositions;
		if (dashTotalCands) dashTotalCands.textContent = totalCandidates;
		if (dashSelected) dashSelected.textContent = selectedCount;
	}

	function renderPipelineSnapshot() {
		// Build an interactive horizontal pipeline with counts and percentages
		var all = loadCands(); var sel = loadSelected(); var reqs = loadReqs();
		var title = (isNaN(sel) || !reqs[sel]) ? null : reqs[sel].title;
		var related = all.filter(function (x) { return !title || x.reqTitle === title; });
		var total = related.length || 0;
		var statuses = ['Applied', 'Shortlisted', 'Selected', 'Offered', 'Rejected'];
		var counts = statuses.reduce(function (acc, s) { acc[s] = related.filter(function (x) { return x.status === s; }).length; return acc; }, {});
		var statusEmojis = { Applied: '🔵', Shortlisted: '🟡', Selected: '🟢', Offered: '💰', Rejected: '❌' };
		var statusColors = { Applied: '#3b82f6', Shortlisted: '#8b5cf6', Selected: '#10b981', Offered: '#f59e0b', Rejected: '#ef4444' };

		var snap = document.getElementById('pipeline-snapshot'); if (!snap) return;
		if (total === 0) { snap.innerHTML = '<div class="jp-empty-state"><div style="font-size:20px;">📊</div><p>No candidates yet. Add some to see the pipeline.</p></div>'; return; }

		var html = '<div style="padding:0;">';
		html += '<div style="height:10px;border-radius:10px;background:#e2e8f0;overflow:hidden;margin-bottom:16px;display:flex;gap:0;">';
		statuses.forEach(function (s) {
			var cnt = counts[s] || 0; var pct = total ? (cnt / total) * 100 : 0;
			html += '<div class="pipeline-seg" data-status="' + s + '" style="flex-basis:' + pct + '%;background:' + statusColors[s] + ';cursor:pointer;transition:all 0.2s;opacity:0.7" title="' + cnt + ' ' + s + '"></div>';
		});
		html += '</div>';

		html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">';
		statuses.forEach(function (s) {
			var cnt = counts[s] || 0;
			var isFiltered = PIPELINE_FILTER === s;
			html += '<div class="pipeline-card" data-filter="' + s + '" style="padding:12px;border-radius:8px;cursor:pointer;border:2px solid transparent;background:' + (isFiltered ? statusColors[s] + '11' : '#f9fafb') + ';border-color:' + (isFiltered ? statusColors[s] : '#e2e8f0') + ';transition:all 0.2s;text-align:center;">' +

				'<div style="font-size:11px;font-weight:700;color:#000000;text-transform:uppercase;">' + (s || '').toUpperCase() + '</div>' +
				'<div style="font-size:18px;font-weight:700;color:' + statusColors[s] + ';margin-top:4px;">' + cnt + '</div>' +
				'</div>';
		});
		html += '</div>';

		if (PIPELINE_FILTER) { html += '<div style="margin-top:12px"><button id="clear-pipeline-filter" class="btn btn-secondary btn-sm">✕ Clear Filter (' + PIPELINE_FILTER + ')</button></div>'; }
		html += '</div>';

		snap.innerHTML = html;

		// wire click handlers for segments
		snap.querySelectorAll('.pipeline-seg').forEach(function (seg) {
			seg.addEventListener('click', function () {
				var s = this.getAttribute('data-status');
				PIPELINE_FILTER = (PIPELINE_FILTER === s) ? '' : s;
				renderPipelineSnapshot();
				renderCandidateList();
				renderPipelineCandidates();
			});
			seg.addEventListener('mouseenter', function () { this.style.opacity = '1'; });
			seg.addEventListener('mouseleave', function () { this.style.opacity = (PIPELINE_FILTER === this.getAttribute('data-status')) ? '1' : '0.7'; });
		});

		snap.querySelectorAll('.pipeline-card').forEach(function (card) {
			card.addEventListener('click', function () {
				var s = this.getAttribute('data-filter');
				PIPELINE_FILTER = (PIPELINE_FILTER === s) ? '' : s;
				renderPipelineSnapshot();
				renderCandidateList();
				renderPipelineCandidates();
			});
		});

		var clearBtn = document.getElementById('clear-pipeline-filter');
		if (clearBtn) clearBtn.addEventListener('click', function () { PIPELINE_FILTER = ''; renderPipelineSnapshot(); renderCandidateList(); renderPipelineCandidates(); });
	}

	function renderPipelineCandidates() {
		// Show candidate profiles filtered by PIPELINE_FILTER in the pipeline section
		var container = document.getElementById('pipeline-candidates-list'); if (!container) return;
		var header = document.getElementById('pipeline-cand-header');
		var subheader = document.getElementById('pipeline-cand-subheader');

		if (!PIPELINE_FILTER) {
			container.innerHTML = '<div class="jp-empty-state"><p>Click a status in the pipeline above</p></div>';
			if (header) header.textContent = 'Candidate Profiles';
			if (subheader) subheader.textContent = 'Select a status to view candidates';
			return;
		}

		var all = loadCands(); var sel = loadSelected(); var reqs = loadReqs();
		var title = (isNaN(sel) || !reqs[sel]) ? null : reqs[sel].title;
		var filtered = all.filter(function (x) {
			if (title && x.reqTitle !== title) return false;
			if (x.status !== PIPELINE_FILTER) return false;
			return true;
		});

		if (header) header.textContent = PIPELINE_FILTER + ' Candidates';
		if (subheader) subheader.textContent = filtered.length + ' candidate(s)';

		if (filtered.length === 0) {
			container.innerHTML = '<div class="jp-empty-state"><p>No candidates with status "' + PIPELINE_FILTER + '"</p></div>';
			return;
		}

		container.innerHTML = '';
		filtered.forEach(function (cand, idx) {
			var globalIdx = all.indexOf(cand);
			container.insertAdjacentHTML('beforeend', candidateCardHtml(cand, globalIdx));
		});

		// Wire action buttons
		container.querySelectorAll('.btn-select').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Selected'); renderPipelineSnapshot(); renderPipelineCandidates(); }); });
		container.querySelectorAll('.btn-reject').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Rejected'); renderPipelineSnapshot(); renderPipelineCandidates(); }); });
		container.querySelectorAll('.btn-finalize').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Offered'); renderPipelineSnapshot(); renderPipelineCandidates(); }); });
	}

	function formatRangeValue(minVal, maxVal, unit, legacyVal) {
		if (minVal || maxVal) {
			var minText = (minVal || '').toString().trim();
			var maxText = (maxVal || '').toString().trim();
			var sep = (minText && maxText) ? ' - ' : '';
			return (minText + sep + maxText + (unit ? (' ' + unit) : '')).trim();
		}
		return (legacyVal || '').toString().trim();
	}

	function candidateCardHtml(cand, idx) {
		var statusClass = 'status-applied';
		var statusIcon = '';
		if (cand.status === 'Selected') { statusClass = 'status-selected'; }
		if (cand.status === 'Rejected') { statusClass = 'status-rejected'; }
		if (cand.status === 'Shortlisted') { statusClass = 'status-shortlist'; }
		if (cand.status === 'Offered') { statusClass = 'status-offered'; }
		var expDisplay = formatRangeValue(cand.exp_min, cand.exp_max, 'yrs', cand.years);

		var html = '<div class="candidate-card" data-idx="' + idx + '">' +
			'<div class="candidate-head">' +
			'<div style="flex:1">' +
			'<input type="checkbox" class="select-checkbox" data-idx="' + idx + '" style="margin-right:8px;" />' +
			'<span class="candidate-title">' + cand.name + '</span>' +
			(expDisplay ? '<span style="color:#000000;font-size:14px;margin-left:8px;">(' + expDisplay + ')</span>' : '') +
			'</div>' +
			'<span class="status-badge ' + statusClass + '">' + statusIcon + ' ' + cand.status + '</span>' +
			'</div>' +
			'<div class="candidate-meta" style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
			(cand.email ? ('<div><strong style="font-size:12px;">' + cand.email + '</strong></div>') : '') +
			(cand.phone ? ('<div><strong style="font-size:12px;">' + cand.phone + '</strong></div>') : '') +
			(cand.skills ? ('<div style="grid-column:1/-1;"><strong style="font-size:12px;">' + cand.skills + '</strong></div>') : '') +
			(cand.expected ? ('<div><strong style="font-size:12px;">' + cand.expected + '</strong></div>') : '') +
			'</div>' +
			'<div class="candidate-actions-row">' +
			actionButtonsMarkup(cand) +
			'<button class="btn btn-sm btn-secondary btn-edit">✏️ Edit</button>' +
			'</div>' +
			'</div>';
		return html;
	}

	function actionButtonsMarkup(cand) {
		var base = '';
		if (cand.status === 'Applied') {
			base += '<button class="btn btn-sm" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;" title="Select this candidate" class="btn-select">✅ Select</button>';
			base += '<button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;" title="Reject this candidate" class="btn-reject">❌ Reject</button>';
		} else if (cand.status === 'Selected') {
			base += '<button class="btn btn-sm btn-success btn-finalize">💼 Send Offer</button>';
			base += '<button class="btn btn-sm" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;" class="btn-retake">↩️ Retake</button>';
		} else if (cand.status === 'Rejected') {
			base += '<button class="btn btn-sm" style="background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;" class="btn-reactivate">🔄 Reactivate</button>';
		} else if (cand.status === 'Offered') {
			base += '<button class="btn btn-sm" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;" class="btn-select">✅ Confirm</button>';
		} else {
			base += '<button class="btn btn-sm" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;" class="btn-select">✅ Select</button>';
			base += '<button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;" class="btn-reject">❌ Reject</button>';
		}
		return base;
	}

	function renderCandidateList() {
		var fullList = loadCands(); var sel = loadSelected(); var reqs = loadReqs();
		var title = (isNaN(sel) || !reqs[sel]) ? null : reqs[sel].title;
		var container = document.getElementById('candidate-list'); if (!container) return;

		// read UI controls
		var search = (document.getElementById('cand-search') || { value: '' }).value.trim().toLowerCase();
		var sort = (document.getElementById('cand-sort') || { value: 'newest' }).value;
		var size = parseInt((document.getElementById('page-size') || { value: '5' }).value) || 5;
		var page = parseInt(container.getAttribute('data-page') || '1') || 1;

		// filter by requirement, search and pipeline filter - preserve original indices
		var filtered = [];
		fullList.forEach(function (x, i) {
			if (title && x.reqTitle !== title) return;
			if (PIPELINE_FILTER && x.status !== PIPELINE_FILTER) return;
			if (search && !((x.name || '').toLowerCase().includes(search) || (x.skills || '').toLowerCase().includes(search) || (x.email || '').toLowerCase().includes(search))) return;
			filtered.push({ item: x, idx: i });
		});

		// sort
		if (sort === 'name_asc') filtered.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
		else if (sort === 'name_desc') filtered.sort(function (a, b) { return (b.name || '').localeCompare(a.name || ''); });
		else if (sort === 'status') filtered.sort(function (a, b) { return (a.status || '').localeCompare(b.status || ''); });
		else filtered.sort(function (a, b) { return new Date(b.created || 0) - new Date(a.created || 0); });

		var candCountEl = document.getElementById('candidate-count'); if (candCountEl) candCountEl.innerText = filtered.length;

		// pagination
		var total = filtered.length; var totalPages = Math.max(1, Math.ceil(total / size));
		if (page > totalPages) page = totalPages;
		container.setAttribute('data-page', page);
		container.innerHTML = '';
		var start = (page - 1) * size; var end = Math.min(total, start + size);
		filtered.slice(start, end).forEach(function (obj, idx) {
			// obj: {item, idx}
			var c = obj.item; var globalIndex = obj.idx;
			container.insertAdjacentHTML('beforeend', candidateCardHtml(c, globalIndex));
		});

		// wire actions
		container.querySelectorAll('.btn-r1').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'R1'); }); });
		container.querySelectorAll('.btn-r2').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'R2'); }); });
		container.querySelectorAll('.btn-select').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Selected'); }); });
		container.querySelectorAll('.btn-reject').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Rejected'); }); });
		container.querySelectorAll('.btn-finalize').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Offered'); }); });
		container.querySelectorAll('.btn-retake').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Applied'); }); });
		container.querySelectorAll('.btn-retake2').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'R1'); }); });
		container.querySelectorAll('.btn-reactivate').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Applied'); }); });
		container.querySelectorAll('.btn-revoke').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); updateCandidateStatus(idx, 'Selected'); }); });
		container.querySelectorAll('.btn-del').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); if (!confirm('Delete candidate?')) return; var list = loadCands(); if (!isNaN(idx) && list[idx]) { list.splice(idx, 1); saveCands(list); renderCandidateList(); renderPipelineSnapshot(); } }); });

		// edit action
		container.querySelectorAll('.btn-edit').forEach(function (b) { b.addEventListener('click', function (e) { var idx = closestIdx(this); openAddCandidateForm(idx); }); });

		// checkbox handlers
		container.querySelectorAll('.select-checkbox').forEach(function (cb) { cb.addEventListener('change', function () { /* no-op */ }); });

		// card click opens detail modal (ignore clicks on buttons/inputs)
		container.querySelectorAll('.candidate-card').forEach(function (card) {
			card.addEventListener('click', function (e) {
				if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
				var idx = parseInt(this.getAttribute('data-idx'));
				openCandidateDetail(idx);
			});
		});

		// render pagination UI
		var pager = document.getElementById('candidate-pagination'); if (pager) {
			pager.innerHTML = '';
			var prev = document.createElement('button'); prev.className = 'page-btn'; prev.innerText = '‹ Prev'; prev.disabled = page <= 1; prev.addEventListener('click', function () { container.setAttribute('data-page', Math.max(1, page - 1)); renderCandidateList(); }); pager.appendChild(prev);
			for (var p = 1; p <= totalPages; p++) {
				var b = document.createElement('button'); b.className = 'page-btn' + (p === page ? ' active' : ''); b.innerText = p; (function (pp) { b.addEventListener('click', function () { container.setAttribute('data-page', pp); renderCandidateList(); }); })(p); pager.appendChild(b);
			}
			var next = document.createElement('button'); next.className = 'page-btn'; next.innerText = 'Next ›'; next.disabled = page >= totalPages; next.addEventListener('click', function () { container.setAttribute('data-page', Math.min(totalPages, page + 1)); renderCandidateList(); }); pager.appendChild(next);
		}
	}

	function closestIdx(node) {
		var card = node.closest('.candidate-card'); if (!card) return null; return parseInt(card.getAttribute('data-idx'));
	}

	function updateCandidateStatus(idx, newStatus) {
		var list = loadCands(); if (idx == null || !list[idx]) return;
		var name = list[idx].name || 'candidate';
		var needConfirm = (newStatus === 'Offered' || newStatus === 'Rejected' || newStatus === 'Selected');
		if (needConfirm) { if (!confirm('Change status to "' + newStatus + '" for ' + name + '?')) return; }
		list[idx].status = newStatus; saveCands(list); renderCandidateList(); renderPipelineSnapshot(); updateDashboardMetrics();
	}

	// Candidate detail (right-side panel)
	function openCandidateDetail(idx) {
		var list = loadCands(); if (idx == null || !list[idx]) return; var c = list[idx];
		var panel = document.getElementById('candidate-detail-panel');
		var body = document.getElementById('candidate-detail-body');
		var sub = document.getElementById('candidate-detail-sub');
		if (!panel || !body) return;

		sub.innerText = (c.name || 'Candidate') + ' • ' + (c.email || '') + (c.phone ? (' • ' + c.phone) : '');

		var html = '';
		html += '<div style="margin-bottom:16px;"'
			+ '<div style="font-weight:800;font-size:18px;color:#0f172a;">' + (c.name || 'Candidate') + '</div>'
			+ '<div style="display:flex;gap:8px;margin-top:8px;">'
			+ '</div></div>';

		html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
		html += '<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Status</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + (c.status || 'N/A') + '</div>' +
			'</div>';
		html += '<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Email</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;word-break:break-all;font-size:13px;">' + (c.email || 'N/A') + '</div>' +
			'</div>';
		html += '<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Phone</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + (c.phone || 'N/A') + '</div>' +
			'</div>';
		var expValue = formatRangeValue(c.exp_min, c.exp_max, 'yrs', c.years) || 'N/A';
		var ctcValue = formatRangeValue(c.ctc_min, c.ctc_max, '', c.expected) || 'N/A';
		html += '<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Experience</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + expValue + '</div>' +
			'</div>';
		html += '<div style="padding:12px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;">' +
			'<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;">Expected CTC</div>' +
			'<div style="font-weight:600;margin-top:4px;color:#000000;">' + ctcValue + '</div>' +
			'</div>';
		html += '</div>';

		var skillsDisplay = (c.skills || '');
		if (skillsDisplay) {
			html += '<div style="margin-bottom:16px;">' +
				'<h4 style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#000000;">Skills</h4>' +
				'<div style="padding:10px;background:#ffffff;border:1px solid #eef2f7;border-radius:8px;font-size:13px;color:#000000;">' + skillsDisplay + '</div>' +
				'</div>';
		}

		html += '<div style="display:flex;gap:8px;">' +
			'<button id="cand-edit" class="btn btn-secondary btn-sm">Edit</button>' +
			'<button id="cand-delete" class="btn btn-danger btn-sm">Delete</button>' +
			'<button id="cand-close" class="btn btn-secondary btn-sm">Close</button>' +
			'</div>';

		body.innerHTML = html;

		// wire actions
		var editBtn = document.getElementById('cand-edit'); if (editBtn) editBtn.addEventListener('click', function () { openAddCandidateForm(idx); });
		var delBtn = document.getElementById('cand-delete'); if (delBtn) delBtn.addEventListener('click', function () { if (!confirm('Delete candidate?')) return; var arr = loadCands(); if (arr[idx]) arr.splice(idx, 1); saveCands(arr); renderCandidateList(); renderPipelineSnapshot(); body.innerHTML = '<div class="jp-empty-state" style="padding:80px 40px;text-align:center;"><div style="font-size:24px;margin-bottom:16px;">👤</div><p style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:8px;">No Candidate Selected Yet</p><p style="font-size:14px;color:#6b7280;line-height:1.6;">Click on a candidate name from the list to view their profile, experience, skills, and status.</p></div>'; document.getElementById('candidate-detail-sub').innerText = 'No candidate selected'; });
		var closeBtn = document.getElementById('cand-close'); if (closeBtn) closeBtn.addEventListener('click', function () { body.innerHTML = '<div class="jp-empty-state" style="padding:80px 40px;text-align:center;"><div style="font-size:24px;margin-bottom:16px;">👤</div><p style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:8px;">No Candidate Selected Yet</p><p style="font-size:14px;color:#6b7280;line-height:1.6;">Click on a candidate name from the list to view their profile, experience, skills, and status.</p></div>'; document.getElementById('candidate-detail-sub').innerText = 'No candidate selected'; });
	}

	// Add candidate form (simple modal)
	function openAddCandidateForm() {
		// support edit: if first arg provided, open in edit mode
		var args = Array.prototype.slice.call(arguments);
		var editIdx = (args && args.length) ? args[0] : null;
		var modal = document.getElementById('modal-root');
		if (!modal) {
			console.error('[job-posting] modal-root element not found in openAddCandidateForm!');
			return;
		}
		modal.style.display = 'flex';
		console.log('[job-posting] candidate modal opened');
		var backing = '<div class="modal-backdrop" id="modal-backdrop"></div>';
		var title = editIdx !== null ? 'Edit Candidate' : 'Add Candidate';
		var existing = editIdx !== null ? loadCands()[editIdx] : null;
		var legacyExp = existing ? (existing.years || '') : '';
		var legacyCtc = existing ? (existing.expected || '') : '';
		modal.innerHTML = backing + '<div class="modal-panel">' +
			'<div style="font-weight:700;margin-bottom:16px;font-size:16px;color:#0f172a;">' + title + '</div>' +
			'<input id="c-name" class="input" placeholder="Name" value="' + (existing ? (existing.name || '') : '') + '">' +
			'<input id="c-email" class="input" placeholder="Email" value="' + (existing ? (existing.email || '') : '') + '">' +
			'<input id="c-phone" class="input" placeholder="Phone" value="' + (existing ? (existing.phone || '') : '') + '">' +
			'<div class="row-flex"><input id="c-exp-min" class="input" placeholder="Min Experience (yrs)" value="' + (existing ? (existing.exp_min || legacyExp) : '') + '"><input id="c-exp-max" class="input" placeholder="Max Experience (yrs)" value="' + (existing ? (existing.exp_max || '') : '') + '"></div>' +
			'<div class="row-flex"><input id="c-ctc-min" class="input" placeholder="Min CTC" value="' + (existing ? (existing.ctc_min || legacyCtc) : '') + '"><input id="c-ctc-max" class="input" placeholder="Max CTC" value="' + (existing ? (existing.ctc_max || '') : '') + '"></div>' +
			'<input id="c-skills" class="input" placeholder="Skills, comma separated" value="' + (existing ? (existing.skills || '') : '') + '">' +
			'<div style="display:flex;gap:8px;"><button id="c-save" class="btn btn-primary">✓ Save</button><button id="c-cancel" class="btn btn-secondary">Cancel</button></div>' +
			'</div>';

		// Close on backdrop click
		document.getElementById('modal-backdrop').addEventListener('click', function () { document.getElementById('modal-root').style.display = 'none'; });
		// wire
		// cancel
		document.getElementById('c-cancel').addEventListener('click', function () { document.getElementById('modal-root').style.display = 'none'; });
		// save (add or update)
		document.getElementById('c-save').addEventListener('click', function () {
			var name = document.getElementById('c-name').value.trim(); if (!name) { frappe.msgprint('Name required'); return; }
			var list = loadCands();
			var candObj = {
				name: name,
				email: document.getElementById('c-email').value.trim(),
				phone: document.getElementById('c-phone').value.trim(),
				exp_min: document.getElementById('c-exp-min').value.trim(),
				exp_max: document.getElementById('c-exp-max').value.trim(),
				ctc_min: document.getElementById('c-ctc-min').value.trim(),
				ctc_max: document.getElementById('c-ctc-max').value.trim(),
				skills: document.getElementById('c-skills').value.trim(),
				status: 'Applied',
				reqTitle: (function () { var s = loadSelected(); var r = loadReqs(); return (isNaN(s) || !r[s]) ? '' : r[s].title; })(),
				created: new Date().toISOString()
			};
			if (editIdx !== null && list[editIdx]) { // update existing
				// preserve status if updating
				candObj.status = list[editIdx].status || candObj.status;
				candObj.years = list[editIdx].years || '';
				candObj.expected = list[editIdx].expected || '';
				list[editIdx] = candObj;
			} else { list.push(candObj); }
			saveCands(list); document.getElementById('modal-root').style.display = 'none'; renderCandidateList(); renderPipelineSnapshot(); updateDashboardMetrics();
		});
		// focus first input
		setTimeout(function () {
			var fld = document.getElementById('c-name'); if (fld) try { fld.focus(); } catch (e) { }
		}, 10);
	}

	// bulk actions and export
	function getFilteredCandidates() {
		var list = loadCands(); var sel = loadSelected(); var reqs = loadReqs();
		var title = (isNaN(sel) || !reqs[sel]) ? null : reqs[sel].title;
		var search = (document.getElementById('cand-search') || { value: '' }).value.trim().toLowerCase();
		var sort = (document.getElementById('cand-sort') || { value: 'newest' }).value;
		var filtered = list.filter(function (x) { if (title && x.reqTitle !== title) return false; if (!search) return true; return ((x.name || '').toLowerCase().includes(search) || (x.skills || '').toLowerCase().includes(search) || (x.email || '').toLowerCase().includes(search)); });
		if (sort === 'name_asc') filtered.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
		else if (sort === 'name_desc') filtered.sort(function (a, b) { return (b.name || '').localeCompare(a.name || ''); });
		else if (sort === 'status') filtered.sort(function (a, b) { return (a.status || '').localeCompare(b.status || ''); });
		else filtered.sort(function (a, b) { return new Date(b.created || 0) - new Date(a.created || 0); });
		return filtered;
	}

	function exportCandidatesCSV() {
		var filtered = getFilteredCandidates();
		if (!filtered.length) { frappe.msgprint('No candidates to export'); return; }
		var cols = ['Name', 'Email', 'Phone', 'Exp Min', 'Exp Max', 'CTC Min', 'CTC Max', 'Skills', 'Status', 'Requirement', 'Created', 'Address'];
		var rows = [cols.join(',')];
		filtered.forEach(function (c) {
			var line = [c.name || '', c.email || '', (c.phone || ''), (c.exp_min || c.years || ''), (c.exp_max || ''), (c.ctc_min || c.expected || ''), (c.ctc_max || ''), '"' + (c.skills || '') + '"', c.status || '', c.reqTitle || '', c.created || '', (c.address || '')];
			rows.push(line.map(function (v) { return '"' + String((v || '')).replace(/"/g, '""') + '"'; }).join(','));
		});
		var csv = rows.join('\n');
		var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a'); a.href = url; a.download = 'candidates_export.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
	}

	function applyBulkStatus() {
		var selStatus = (document.getElementById('bulk-status') || { value: '' }).value; if (!selStatus) { frappe.msgprint('Select a bulk status'); return; }
		var checks = Array.prototype.slice.call(document.querySelectorAll('.select-checkbox:checked'));
		if (!checks.length) { frappe.msgprint('No candidates selected'); return; }
		if (!confirm('Apply status "' + selStatus + '" to ' + checks.length + ' candidate(s)?')) return;
		var idxs = checks.map(function (c) { return parseInt(c.getAttribute('data-idx')); }).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
		var list = loadCands(); idxs.forEach(function (i) { if (list[i]) list[i].status = selStatus; }); saveCands(list); renderCandidateList(); renderPipelineSnapshot(); updateDashboardMetrics();
	}

	// wire main buttons
	var btnAdd = document.getElementById('add-candidate');
	if (btnAdd) {
		btnAdd.addEventListener('click', function (e) {
			e.preventDefault();
			openAddCandidateForm();
		});
	}

	var reqNew = document.getElementById('req-new');
	if (reqNew) {
		reqNew.addEventListener('click', function (e) {
			e.preventDefault();
			console.log('[job-posting] req-new clicked');
			openEditRequirementForm();
		});
	} else {
		console.warn('[job-posting] Could not find req-new button');
	}
	var deleteCandidatesBtn = document.getElementById('delete-candidates'); if (deleteCandidatesBtn) deleteCandidatesBtn.addEventListener('click', function () {
		var checks = Array.prototype.slice.call(document.querySelectorAll('.select-checkbox:checked'));
		if (!checks.length) { frappe.msgprint('No candidates selected'); return; }
		var idxs = checks.map(function (c) { return parseInt(c.getAttribute('data-idx')); }).sort(function (a, b) { return b - a; });
		var list = loadCands();
		idxs.forEach(function (i) { if (!isNaN(i) && list[i]) list.splice(i, 1); });
		saveCands(list); renderCandidateList(); renderPipelineSnapshot(); updateDashboardMetrics();
	});
	var exportBtn = document.getElementById('export-csv'); if (exportBtn) exportBtn.addEventListener('click', exportCandidatesCSV);
	var applyBulkBtn = document.getElementById('apply-bulk-status'); if (applyBulkBtn) applyBulkBtn.addEventListener('click', applyBulkStatus);
	var reqSearch = document.getElementById('req-search'); if (reqSearch) reqSearch.addEventListener('input', function () { renderReqList(this.value.trim().toLowerCase()); });

	// wire candidate list filters to update on change
	var candSearch = document.getElementById('cand-search'); if (candSearch) candSearch.addEventListener('input', function () { renderCandidateList(); });
	var candSort = document.getElementById('cand-sort'); if (candSort) candSort.addEventListener('change', function () { renderCandidateList(); });
	var pageSize = document.getElementById('page-size'); if (pageSize) pageSize.addEventListener('change', function () { document.getElementById('candidate-list').setAttribute('data-page', '1'); renderCandidateList(); });
	var filterStatus = document.getElementById('filter-status'); if (filterStatus) filterStatus.addEventListener('change', function () { PIPELINE_FILTER = this.value; renderCandidateList(); });

	// wire screen navigation
	var navTabs = document.querySelectorAll('.nav-tab');
	navTabs.forEach(function (tab) {
		tab.addEventListener('click', function () {
			var screenName = this.getAttribute('data-screen');
			switchScreen(screenName);
		});
	});

	// wire navigation buttons
	var navToCandidates = document.getElementById('nav-to-candidates');
	if (navToCandidates) navToCandidates.addEventListener('click', function () { switchScreen('candidates'); });

	var navBackFromCandidates = document.getElementById('nav-back-from-candidates');
	if (navBackFromCandidates) navBackFromCandidates.addEventListener('click', function () { switchScreen('requirements'); });

	// wire add inside selected panel
	document.addEventListener('click', function (e) { if (e.target && e.target.id === 'btn-add-cand-inline') openAddCandidateForm(); });

	// initial render all
	frappe.job_recruitment_refresh = function () {
		renderReqList();
		renderSelectedRequirement();
		renderCandidateList();
		renderPipelineSnapshot();
		updateDashboardMetrics();
	};
	frappe.job_recruitment_refresh();
}