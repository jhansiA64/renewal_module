
frappe.pages['customcalendar'].on_page_load = function (wrapper) {
	new customcalendarpage(wrapper);
};

frappe.pages['customcalendar'].on_page_show = function (wrapper) {
	//console.log("🔄 Tickets page showing", wrapper);
	console.log("🔄 customcalendar page showing");
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureFullCalendarCss = () => {
		if (!document.querySelector('link[data-fullcalendar-css="1"]')) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.7/index.global.min.css";
			link.setAttribute("data-fullcalendar-css", "1");
			document.head.appendChild(link);
		}
	};
	const ensureSupportLayoutLoaded = (cb) => {
		const scriptsToLoad = [];
		if (typeof loadSupportLayout !== "function") {
			scriptsToLoad.push("/assets/renewal_module/js/issue_themes/support_layout2.js");
		}
		if (typeof FullCalendar === "undefined") {
			scriptsToLoad.push("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.7/index.global.min.js");
		}

		if (!scriptsToLoad.length) {
			ensureFullCalendarCss();
			return cb();
		}

		frappe.require(scriptsToLoad, () => {
			ensureFullCalendarCss();
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css"
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.customcalendar_page || frappe.customcalendar_page.wrapper !== pageWrapper) {
				frappe.customcalendar_page = new customcalendarpage(pageWrapper);
			}
			frappe.customcalendar_page.render();
		});
	});
};

class customcalendarpage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.calendar = null;
		this.draggable = null;
		this.source_keys = ["holidays", "appointments", "call_lists", "tasks"];
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: "Calendar",
			single_column: true,
		});
	}
	render() {

		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				// wait until layout injects DOM
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.customcalendar_page_template.body);
			this.handleRoute();

		};

		waitForContent();
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "customcalendar"
		// Reset states
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		$(".menu-parent").removeClass("active");

		// Use data-page for reliable matching
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
					//$parent.children(".sub-menu").slideDown(0);
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

	handleRoute() {
		this.setActiveSidebar();
		this.calendarview();
	}

	getSelectedSources() {
		const selected = [];
		this.source_keys.forEach((key) => {
			const el = document.querySelector(`#cal-source-${key}`);
			if (el && el.checked) selected.push(key);
		});
		return selected.length ? selected : this.source_keys.slice();
	}

	updateSourceSummary(summary = {}) {
		const map = {
			holidays: "calendar-count-holidays",
			appointments: "calendar-count-appointments",
			call_lists: "calendar-count-call_lists",
			tasks: "calendar-count-tasks"
		};

		Object.keys(map).forEach((key) => {
			const el = document.getElementById(map[key]);
			if (el) el.textContent = String(summary[key] || 0);
		});
	}

	renderUpcomingItems(events) {
		const list = document.getElementById("external-events");
		if (!list) return;

		const sorted = (events || [])
			.filter(ev => ev && ev.start)
			.sort((a, b) => new Date(a.start) - new Date(b.start))
			.slice(0, 8);

		if (!sorted.length) {
			list.innerHTML = `<div class="text-muted small">No events in selected range.</div>`;
			return;
		}

		const esc = (s) => String(s || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\"/g, "&quot;")
			.replace(/'/g, "&#039;");

		list.innerHTML = sorted.map((ev) => {
			const route = ev.extendedProps?.route || "";
			const dt = new Date(ev.start);
			const when = isNaN(dt.getTime())
				? ""
				: dt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
			return `
				<div class="external-event dynamic-calendar-event" data-route="${esc(route)}" title="${esc(ev.title)}">
					<div class="fw-semibold">${esc(ev.title)}</div>
					<div class="text-muted small">${esc(when)}</div>
				</div>
			`;
		}).join("");
	}

	async fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
		try {
			const selectedSources = this.getSelectedSources();
			const r = await frappe.call({
				method: "renewal_module.custom_module.page.customcalendar.customcalendar.get_calendar_events",
				args: {
					start: fetchInfo.startStr,
					end: fetchInfo.endStr,
					sources: JSON.stringify(selectedSources)
				}
			});

			const payload = r?.message || {};
			const events = Array.isArray(payload.events) ? payload.events : [];
			this.updateSourceSummary(payload.summary || {});
			this.renderUpcomingItems(events);
			successCallback(events);
		} catch (e) {
			console.error("Calendar events fetch error:", e);
			frappe.show_alert({ message: __("Unable to load calendar events"), indicator: "red" });
			failureCallback(e);
		}
	}

	bindCalendarActions() {
		const refreshBtn = document.getElementById("customcalendar-refresh-btn");
		if (refreshBtn) {
			refreshBtn.onclick = () => {
				if (this.calendar) this.calendar.refetchEvents();
			};
		}

		const createBtn = document.getElementById("customcalendar-create-event");
		if (createBtn) {
			createBtn.onclick = () => {
				frappe.new_doc("Appointment");
			};
		}

		this.source_keys.forEach((key) => {
			const el = document.getElementById(`cal-source-${key}`);
			if (!el) return;
			el.onchange = () => {
				if (this.calendar) this.calendar.refetchEvents();
			};
		});

		const list = document.getElementById("external-events");
		if (list) {
			list.onclick = (e) => {
				const row = e.target.closest(".dynamic-calendar-event");
				if (!row) return;
				const route = row.getAttribute("data-route");
				if (route) window.location.href = route;
			};
		}
	}

	calendarview() {
		const calendarEl = document.getElementById("calendar");

		if (!calendarEl || typeof FullCalendar === "undefined") {
			return;
		}

		if (this.calendar) {
			this.calendar.destroy();
			this.calendar = null;
		}

		this.bindCalendarActions();

		this.calendar = new FullCalendar.Calendar(calendarEl, {
			initialView: "dayGridMonth",
			editable: false,
			droppable: false,
			height: "auto",
			headerToolbar: {
				left: "prev,next today",
				center: "title",
				right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth"
			},
			events: (fetchInfo, successCallback, failureCallback) => {
				this.fetchCalendarEvents(fetchInfo, successCallback, failureCallback);
			},
			eventClick: (info) => {
				const props = info.event.extendedProps || {};
				if (props.route) {
					window.location.href = props.route;
				}
			}
		});

		this.calendar.render();
	}

}

frappe.customcalendar_page_template = {
	body: `
		<div class="customcalendar-page">

			<div class="page-title-head d-flex align-items-center mb-3">
				<div class="flex-grow-1">
					<h4 class="fw-bold m-0">Calendar</h4>
				</div>
				<div class="text-end">
					<ol class="breadcrumb m-0">
						<li class="breadcrumb-item active">Calendar</li>
					</ol>
				</div>
			</div>

			<!-- Content Row -->
			<div class="d-flex gap-2 flex-wrap flex-lg-nowrap customcalendar-content-row">

				<!-- LEFT PANEL -->
				<div class="card rounded-end-0 customcalendar-left-panel">
					<div class="card-body">

						<button id="customcalendar-create-event" class="btn btn-primary w-100 mb-3" type="button">
							+ Create New Event
						</button>

						<button id="customcalendar-refresh-btn" class="btn btn-light w-100 mb-3" type="button">
							Refresh Data
						</button>

						<p class="text-muted fst-italic small">
							Select sources and load dynamic events from ERP data.
						</p>

						<div class="mb-3">
							<label class="d-flex align-items-center gap-2 mb-1"><input id="cal-source-holidays" type="checkbox" checked> Holidays <span id="calendar-count-holidays" class="badge bg-light text-dark">0</span></label>
							<label class="d-flex align-items-center gap-2 mb-1"><input id="cal-source-appointments" type="checkbox" checked> Appointments <span id="calendar-count-appointments" class="badge bg-light text-dark">0</span></label>
							<label class="d-flex align-items-center gap-2 mb-1"><input id="cal-source-call_lists" type="checkbox" checked> Calls <span id="calendar-count-call_lists" class="badge bg-light text-dark">0</span></label>
							<label class="d-flex align-items-center gap-2"><input id="cal-source-tasks" type="checkbox" checked> Tasks <span id="calendar-count-tasks" class="badge bg-light text-dark">0</span></label>
						</div>

						<div id="external-events">
							<div class="text-muted small">Loading upcoming events...</div>
						</div>

					</div>
				</div>

				<!-- CALENDAR -->
				<div class="card flex-grow-1 rounded-start-0 border-start-0 customcalendar-right-panel">
					<div class="card-body">
						<div id="calendar"></div>
					</div>
				</div>

			</div>

		</div>

		
	`
};