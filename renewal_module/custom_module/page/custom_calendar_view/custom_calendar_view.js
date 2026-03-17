
frappe.pages['custom-calendar-view'].on_page_load = function (wrapper) {
	new Mypage(wrapper);
};

frappe.router.on('change', () => {
	const route = frappe.get_route();
	if (frappe.customer_calendar_view_page && route[0] !== "custom-calendar-view") {
		location.reload();
	}
});

class Mypage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'calendar',
			single_column: true
		});
		this.load_css(() => {
			this.make();
		});
	}

	load_css(callback) {
		// Tailwind CSS
		const tailwind = document.createElement("link");
		tailwind.rel = "stylesheet";
		tailwind.href = "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css";
		tailwind.onload = () => {
			if (callback) callback();
		};
		document.head.appendChild(tailwind);

		// Google Fonts - Inter
		const fontPreconnect1 = document.createElement("link");
		fontPreconnect1.rel = "preconnect";
		fontPreconnect1.href = "https://fonts.googleapis.com";
		document.head.appendChild(fontPreconnect1);

		const fontPreconnect2 = document.createElement("link");
		fontPreconnect2.rel = "preconnect";
		fontPreconnect2.href = "https://fonts.gstatic.com";
		fontPreconnect2.crossOrigin = "true";
		document.head.appendChild(fontPreconnect2);

		const fontLink = document.createElement("link");
		fontLink.rel = "stylesheet";
		fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
		document.head.appendChild(fontLink);
	}

	make() {
		// Ensure the HTML template is appended
		let body = frappe.customer_calendar_view_page.body;  // check this object exists
		$(this.page.main).append(body);
		this.currentDate = new Date();
		this.currentView = "week";  // default view
		this.bindEvents();
		this.initCalendarResponsive();
		this.renderMiniCalendar(new Date());
		this.renderTimeLabels(0, 24);
		this.renderWeekHeader(new Date());
		this.renderGridLines(0, 24);
		this.renderCurrentTimeIndicator();
		this.updateMonthLabel();
		//this.loadAndRender();
		this.refreshCalendar();
		// Refresh current time indicator every minute
		//setInterval(() => this.renderCurrentTimeIndicator(0), 60000);
		setInterval(() => this.renderCurrentTimeIndicator(0, this.currentDate, this.getVisibleWeekDates()), 60000);
	}

	initCalendarResponsive() {
		const sidebar = document.getElementById('sidebar');
		const overlay = document.getElementById('sidebar-overlay');
		const toggleBtn = document.getElementById('toggle-sidebar');

		const openMobile = () => {
			sidebar.classList.remove('hidden');
			sidebar.classList.add('fixed', 'inset-y-0', 'left-0', 'bg-white', 'shadow-2xl', 'sidebar');
			overlay.classList.remove('hidden');
		};
		const closeMobile = () => {
			sidebar.classList.add('hidden');
			sidebar.classList.remove('fixed', 'inset-y-0', 'left-0', 'bg-white', 'shadow-2xl', 'sidebar');
			overlay.classList.add('hidden');
		};

		if (toggleBtn) {
			toggleBtn.addEventListener('click', () => {
				const onMobile = window.innerWidth < 1024; // < lg
				if (!onMobile) return; // desktop: sidebar always visible
				const isHidden = sidebar.classList.contains('hidden');
				isHidden ? openMobile() : closeMobile();
			});
		}
		if (overlay) overlay.addEventListener('click', closeMobile);

		// ✅ Close when clicking outside sidebar
		document.addEventListener('click', (e) => {
			const onMobile = window.innerWidth < 1024;
			if (!onMobile) return;
			if (
				!sidebar.contains(e.target) &&
				!toggleBtn.contains(e.target) &&
				!sidebar.classList.contains('hidden')
			) {
				closeMobile();
			}
		});

		const handleResize = () => {
			if (window.innerWidth >= 1024) {
				// desktop
				sidebar.classList.remove('hidden', 'fixed', 'inset-y-0', 'left-0', 'bg-white', 'shadow-2xl', 'sidebar');
				overlay.classList.add('hidden');
			} else {
				// mobile default hidden
				sidebar.classList.add('hidden');
			}
		};
		window.addEventListener('resize', handleResize);
		handleResize();
	}


	bindEvents() {
		const createBtn = document.getElementById("create-btn");
		const dropdown = document.getElementById("create-dropdown");

		createBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			dropdown.classList.toggle("hidden");
		});

		// Close dropdown when clicking outside
		document.addEventListener("click", () => {
			dropdown.classList.add("hidden");
		});

		// ✅ Navigation buttons
		document.getElementById("mini-prev").addEventListener("click", () => {
			this.currentDate = new Date(
				this.currentDate.getFullYear(),
				this.currentDate.getMonth() - 1,
				1 // always reset to day 1
			);
			this.renderMiniCalendar(this.currentDate);
		});

		document.getElementById("mini-next").addEventListener("click", () => {
			this.currentDate = new Date(
				this.currentDate.getFullYear(),
				this.currentDate.getMonth() + 1,
				1 // always reset to day 1
			);
			this.renderMiniCalendar(this.currentDate);
		});

		document.getElementById("btn-today").addEventListener("click", () => {
			this.currentDate = new Date();
			this.refreshCalendar();
			this.selectedDate = null;
			this.renderMiniCalendar(this.currentDate);
		});

		document.getElementById("btn-prev").addEventListener("click", () => {
			if (this.currentView === "week") {
				this.currentDate.setDate(this.currentDate.getDate() - 7);
			} else if (this.currentView === "day") {
				this.currentDate.setDate(this.currentDate.getDate() - 1);
			} else if (this.currentView === "month") {
				this.currentDate.setMonth(this.currentDate.getMonth() - 1);
			}
			this.selectedDate = null;
			this.renderMiniCalendar(this.currentDate);
			this.refreshCalendar();
			//this.loadAndRender();
		});

		document.getElementById("btn-next").addEventListener("click", () => {
			if (this.currentView === "week") {
				this.currentDate.setDate(this.currentDate.getDate() + 7);
			} else if (this.currentView === "day") {
				this.currentDate.setDate(this.currentDate.getDate() + 1);
			} else if (this.currentView === "month") {
				this.currentDate.setMonth(this.currentDate.getMonth() + 1);
			}
			this.selectedDate = null;
			this.renderMiniCalendar(this.currentDate);
			this.refreshCalendar();
			//this.loadAndRender();
		});


		document.getElementById("view-selector").addEventListener("change", (e) => {
			const newView = e.target.value;
			// If switching from week → day and no header was clicked, default to today
			if (this.currentView === "week" && newView === "day") {
				if (!this.currentDateViewSource || this.currentDateViewSource !== "dayHeaderClick") {
					this.currentDate = new Date();
				}
			}
			this.switchView(newView);
			this.selectedDate = null;
			this.renderMiniCalendar(this.currentDate);
		});

		document.getElementById("toggle-my-calendars").addEventListener("click", () => {
			const list = document.getElementById("calendar-list");
			const icon = document.getElementById("collapse-icon");
			list.classList.toggle("hidden");
			icon.classList.toggle("-rotate-90"); // rotate left when collapsed
		});

		$("#btn-new-appt").on("click", () => frappe.new_doc("Appointment"));
		$("#btn-new-event").on("click", () => frappe.new_doc("Event"));
		$("#btn-new-cal").on("click", () => frappe.new_doc("Custom Calendar"));



	}

	async loadAndRender() {
		let start, end;

		if (this.currentView === "day") {
			start = new Date(this.currentDate);
			end = new Date(this.currentDate);
		} else if (this.currentView === "week") {
			start = new Date(this.currentDate);
			start.setDate(start.getDate() - start.getDay()); // Sunday start
			end = new Date(start);
			end.setDate(start.getDate() + 6); // Saturday end
		} else if (this.currentView === "month") {
			start = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
			end = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
		}

		await this.fetchHolidays(start, end);
		//await this.fetchHolidays1(start, end);
		this.refreshCalendar();
	}


	// put this as a method on your class
	switchView(newView, { date = null, source = null } = {}) {
		if (date) this.currentDate = date;
		if (source) this.currentDateViewSource = source;
		this.currentView = newView;
		//keep the dropdown in sync with the internal state
		const sel = document.getElementById("view-selector");
		if (sel && sel.value !== newView) sel.value = newView;
		this.refreshCalendar();
	}


	renderMiniCalendar(date) {
		console.log("[MiniCal] renderMiniCalendar");
		this.currentDate = date;
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		const year = date.getFullYear();
		const month = date.getMonth();
		// Month header
		document.getElementById("mini-calendar-month").textContent = `${monthNames[month]} ${year}`;
		const grid = document.getElementById("mini-calendar-grid");
		grid.innerHTML = "";
		// Weekday labels
		const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
		weekdays.forEach(d => {
			const span = document.createElement("span");
			span.className = "text-gray-500 font-mini-calendar";
			span.textContent = d;
			grid.appendChild(span);
		});
		// First day + total days
		const firstDay = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		// Previous month placeholders
		const prevDays = new Date(year, month, 0).getDate();
		for (let i = 0; i < firstDay; i++) {
			const span = document.createElement("span");
			span.className = "text-gray-400 font-mini-calendar";
			span.textContent = prevDays - firstDay + i + 1;
			grid.appendChild(span);
		}
		// Dates
		const today = new Date();
		for (let d = 1; d <= daysInMonth; d++) {
			const span = document.createElement("span");
			span.textContent = d;
			span.id = `mini-${year}-${month + 1}-${d}`;
			span.className =
				"py-1 px-2 rounded-full cursor-pointer hover:bg-gray-200 font-mini-calendar text-gray-800";

			const thisDate = new Date(year, month, d);
			// Highlight today
			const isToday =
				d === today.getDate() &&
				month === today.getMonth() &&
				year === today.getFullYear();
			if (isToday) {
				span.classList.add("bg-blue-500", "text-white", "font-bold");
			}
			// Highlight selected date (only if it's in this month/year)
			const isSelected =
				this.selectedDate &&
				d === this.selectedDate.getDate() &&
				month === this.selectedDate.getMonth() &&
				year === this.selectedDate.getFullYear();
			if (isSelected) {
				span.classList.remove("bg-blue-500", "text-white", "font-bold");
				span.classList.add("mini-calendar-highlight", "text-gray-900", "rounded-full", "font-semibold");
				//span.classList.add("bg-blue-400", "text-white", "border-2", "border-blue-600", "font-bold");
				console.log("[MiniCal] Selected cell FOUND in DOM:", span.id, span.className);
			}
			// Click handler
			span.addEventListener("click", () => {
				this.selectedDate = thisDate; // persist globally
				this.currentDate = thisDate;
				this.renderMiniCalendar(this.currentDate); // re-render to update highlight
				// Sync with main calendar view
				if (this.currentView === "day") {
					this.switchView("day", { date: thisDate, source: "miniCalendarClick" });
				} else if (this.currentView === "week") {
					this.switchView("week", { date: thisDate, source: "miniCalendarClick" });

				} else if (this.currentView === "month") {
					this.switchView("month", { date: thisDate, source: "miniCalendarClick" });
				}
			});
			grid.appendChild(span);
		}
	}


	async fetchHolidays(startDate, endDate) {
		try {
			const res = await frappe.call({
				method: "renewal_module.custom_module.page.custom_calendar_view.custom_calendar_view.get_unified_calendar_events",
				args: {
					start: frappe.datetime.obj_to_str(startDate),
					end: frappe.datetime.obj_to_str(endDate)
				}
			});
			this.holidays = res.message || [];
			console.log("holidays:", this.holidays);
		} catch (err) {
			console.error("Failed to fetch holidays", err);
			this.holidays = [];
		}
	}


	refreshCalendar() {
		this.updateMonthLabel();
		if (this.currentView === "week") {
			const timeLabels = document.getElementById("time-labels");
			if (timeLabels) timeLabels.style.display = "block";
			const headerCorner = document.getElementById("header-corner");
			if (headerCorner) headerCorner.style.display = "block";
			//Reset parent + grid layout for week view
			const parent = document.getElementById("grid-lines")?.parentElement;
			if (parent) parent.className = "grid grid-cols-8 relative";
			const grid = document.getElementById("grid-lines");
			if (grid) {
				grid.innerHTML = "";
				grid.className = "col-span-7 relative";
			}
			const start = new Date(this.currentDate);
			start.setDate(start.getDate() - start.getDay());
			const end = new Date(start);
			end.setDate(start.getDate() + 6);
			this.fetchHolidays(start, end).then(() => {
				this.renderTimeLabels(0, 24);
				this.renderWeekHeader(this.currentDate);
				this.renderGridLines(0, 24);
				this.renderCurrentTimeIndicator(0, null, this.getVisibleWeekDates());
			});
		} else if (this.currentView === "day") {
			const timeLabels = document.getElementById("time-labels");
			if (timeLabels) timeLabels.style.display = "block";
			const headerCorner = document.getElementById("header-corner");
			if (headerCorner) headerCorner.style.display = "block";
			//Reset parent + grid layout for week view
			const parent = document.getElementById("grid-lines")?.parentElement;
			if (parent) parent.className = "grid grid-cols-8 relative";
			const grid = document.getElementById("grid-lines");
			if (grid) {
				grid.innerHTML = "";
				grid.className = "col-span-7 relative";
			}
			// Use full-day range so timed events on that day are included
			const dayStart = new Date(this.currentDate);
			dayStart.setHours(0, 0, 0, 0);
			const dayEnd = new Date(this.currentDate);
			dayEnd.setHours(23, 59, 59, 999);
			console.log("Fetching day range:", dayStart, dayEnd,
				frappe.datetime.obj_to_str(dayStart),
				frappe.datetime.obj_to_str(dayEnd));
			this.fetchHolidays(dayStart, dayEnd).then(() => {
				console.log("currentDate for day view:", this.currentDate);
				this.renderDayView(this.currentDate);
				this.renderCurrentTimeIndicator(0, this.currentDate);
			});
		} else if (this.currentView === "month") {
			const start = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
			const end = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
			this.fetchHolidays(start, end).then(() => {
				this.renderMonthView(this.currentDate);
			});
		}
	}


	async renderDayView(date) {
		const parent = document.getElementById("grid-lines").parentElement;
		if (parent) {
			parent.className = "grid grid-cols-8 relative";
		}

		const header = document.getElementById("week-header");
		const allDayRow = document.getElementById("all-day-row");

		// --- Reset to 2-column grid for Day view ---
		header.className = "grid grid-cols-8 text-sm text-center sm:text-sm";
		allDayRow.className = "grid grid-cols-8 text-xs text-center mb-1";

		// Clear both header and all-day row
		header.innerHTML = "";
		allDayRow.innerHTML = "";

		// --- HEADER ---
		// Left cell → Time label
		const timeCell = document.createElement("div");
		timeCell.className = "border-r flex items-center justify-center text-xs text-gray-500";
		timeCell.textContent = "";
		header.appendChild(timeCell);

		// Right cell → Day header
		const dayCell = document.createElement("div");
		dayCell.className = "flex flex-col items-center justify-start py-1";
		const weekday = document.createElement("span");
		weekday.className = "text-sm font-medium sm:text-sm";
		weekday.textContent = date.toLocaleDateString("en-US", { weekday: "short" });
		dayCell.appendChild(weekday);

		const dateCircle = document.createElement("div");
		const today = new Date();
		if (
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		) {
			// ✅ Highlight current date
			dateCircle.className =
				"mt-1 w-8 h-8 flex items-center justify-center day-number sm:text-sm rounded-full bg-blue-600 text-white";
		} else {
			// Normal day (no highlight)
			dateCircle.className =
				"mt-1 w-8 h-8 flex items-center justify-center day-number text-gray-700 sm:text-sm";
		}
		dateCircle.textContent = date.getDate();
		dayCell.appendChild(dateCircle);
		header.appendChild(dayCell);

		// --- ALL-DAY ROW ---
		// Left cell → "All-day" label
		const allDayLabel = document.createElement("div");
		allDayLabel.className = "border-r flex items-center sm:text-sm justify-center text-gray-400";
		allDayLabel.textContent = "";
		allDayRow.appendChild(allDayLabel);

		// Right cell → Events + Holidays
		const allDayDiv = document.createElement("div");
		allDayDiv.className = "flex flex-col items-start justify-start px-2 space-y-0.5";

		const dayStr = [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, "0"),
			String(date.getDate()).padStart(2, "0")
		].join("-");

		const allItems = this.holidays || [];
		// Separate
		const holidayList = allItems.filter(h => h.doctype === "Holiday");
		const eventList = allItems.filter(ev => ev.doctype === "Event");
		const appointmentList = allItems.filter(a => a.doctype === "Appointment");
		const customCalendarList = allItems.filter(c => c.doctype === "Custom Calendar");

		// Collect all items for this day
		const items = [
			...holidayList.filter(h => (h.start || "").split("T")[0] === dayStr)
				.map(h => ({ type: "Holiday", title: h.title, data: h })),
			...eventList.filter(ev => (ev.start || "").split(" ")[0] === dayStr)
				.map(ev => ({ type: "Event", title: ev.title, data: ev })),
			...appointmentList.filter(a => (a.start_date || "").split("T")[0] === dayStr)
				.map(a => ({ type: "Appointment", title: a.title, data: a })),
			...customCalendarList.filter(c => (c.start || "").split(" ")[0] === dayStr)
				.map(c => ({ type: "Custom", title: c.title, data: c }))
		];

		let maxVisible = 1; // Day view can show 2 items before collapsing

		// Render visible items
		items.slice(0, maxVisible).forEach(item => {
			const span = document.createElement("span");
			span.className = {
				Holiday: "bg-red-200 text-red-700",
				Event: "bg-green-200 text-green-700",
				Appointment: "bg-blue-200 text-blue-700",
				Custom: "bg-yellow-200 text-yellow-700"
			}[item.type] + " text-xs sm:text-sm px-2 py-0.5 rounded ellipsis cursor-pointer";

			span.textContent = item.title;
			span.title = item.title;
			span.onclick = e => {
				e.stopPropagation();
				frappe.msgprint(`${item.title}`);
			};
			allDayDiv.appendChild(span);
		});

		// Add "+more" link if extra items
		if (items.length > maxVisible) {
			const moreLink = document.createElement("div");
			moreLink.className = "text-blue-600 text-xs cursor-pointer";
			moreLink.textContent = `+${items.length - maxVisible} more`;
			moreLink.onclick = () => {
				const details = items.map(it => it.title).join("<br>");
				frappe.msgprint(`on ${date.toDateString()}:<br>` + details);
			};
			allDayDiv.appendChild(moreLink);
		}

		allDayRow.appendChild(allDayDiv);

		// ✅ Add click handler for empty space in all-day row
		allDayDiv.addEventListener("click", (e) => {
			if (e.target.tagName === "SPAN" || e.target.classList.contains("text-blue-600")) return; // ignore pills & more link
			e.stopPropagation();
			const start = new Date(date);
			start.setHours(0, 0, 0, 0);
			const end = new Date(start);
			end.setHours(23, 59, 59, 999);
			//this.showNewAppointmentModal(start, end);
			frappe.new_doc("Appointment").then((doc) => {
				frappe.ui.form.make_quick_entry("Appointment", null, null, doc).then((frm) => {
					frm.set_value("custom_start_date", frappe.datetime.obj_to_str(start));
					frm.set_value("custom_start_time", frappe.datetime.str_to_time(frappe.datetime.obj_to_str(start)));
					frm.set_value("custom_end_date", frappe.datetime.obj_to_str(end));
					frm.set_value("custom_end_time", frappe.datetime.str_to_time(frappe.datetime.obj_to_str(end)));
				});
			});
		});

		// --- GRID + TIME LABELS ---
		this.renderTimeLabels(0, 24);
		this.renderGridLines(0, 24);
		// ----------------------------
		// 🟢 Render events in Day grid
		// ----------------------------
		const grid = document.getElementById("grid-lines");
		if (!grid) return;

		const hourHeight = 48; // px per hour
		const viewStartHour = 0;
		const viewEndHour = 24;

		// merge lists (ignore holidays in timed grid)
		const timedItems = [
			...eventList.map(ev => ({ type: "Event", title: ev.title, start: ev.start, end: ev.end })),
			...appointmentList.map(a => ({ type: "Appointment", title: a.title, start: a.start_date_time, end: a.end_date_time })),
			...customCalendarList.map(c => ({ type: "Custom", title: c.title, start: c.start, end: c.end }))
		];

		timedItems.forEach(item => {
			if (!item.start) return;

			const startDate = new Date(item.start);
			const endDate = item.end ? new Date(item.end) : new Date(startDate.getTime() + 30 * 60000);

			// only render if it's the same day
			if (
				startDate.getDate() !== date.getDate() ||
				startDate.getMonth() !== date.getMonth() ||
				startDate.getFullYear() !== date.getFullYear()
			) return;

			const minutesFromStart = (startDate.getHours() - viewStartHour) * 60 + startDate.getMinutes();
			const eventTop = (minutesFromStart / 60) * hourHeight;
			const durationMinutes = (endDate - startDate) / 60000;
			const eventHeight = (durationMinutes / 60) * hourHeight;

			const eventDiv = document.createElement("div");
			eventDiv.className =
				"absolute px-2 py-0.5 rounded text-xs cursor-pointer overflow-hidden";
			eventDiv.style.top = `${eventTop}px`;
			eventDiv.style.height = `${eventHeight}px`;
			eventDiv.style.left = `calc(1 * (100% / 7) + 2px)`;
			eventDiv.style.width = `calc((100% / 7) - 4px)`;

			// coloring by type
			const colors = {
				Event: "bg-green-200 text-green-800 border border-green-300",
				Appointment: "bg-purple-200 text-purple-800 border border-purple-300",
				Custom: "bg-yellow-200 text-yellow-800 border border-yellow-300"
			};
			eventDiv.className += " " + (colors[item.type] || "bg-gray-200");

			eventDiv.textContent = item.title;
			eventDiv.title = `${item.type}: ${item.title}`;

			eventDiv.onclick = e => {
				e.stopPropagation();
				frappe.msgprint(`${item.title}<br>
				${startDate.toLocaleString()} - ${endDate.toLocaleString()}`);
			};

			grid.appendChild(eventDiv);
		});
	}


	renderMonthView(date) {
		// Hide time labels (not needed in month view)
		const timeLabels = document.getElementById("time-labels");
		if (timeLabels) timeLabels.style.display = "none";
		const indicator = document.getElementById("time-indicator");
		if (indicator) indicator.style.display = "none";
		const headerCorner = document.getElementById("header-corner");
		if (headerCorner) headerCorner.style.display = "none";
		// Reset parent layout (important!)
		const parent = document.getElementById("grid-lines").parentElement;
		if (parent) {
			parent.className = "w-full relative mt-3";
		}
		// Reset month grid container
		const grid = document.getElementById("grid-lines");
		grid.innerHTML = "";
		grid.removeAttribute("style");
		grid.className = "w-full";
		const year = date.getFullYear();
		const month = date.getMonth();
		const firstDay = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const daysInPrevMonth = new Date(year, month, 0).getDate();
		const today = new Date();
		// Helper: format date as YYYY-MM-DD
		function formatLocalDate(date) {
			const y = date.getFullYear();
			const m = String(date.getMonth() + 1).padStart(2, "0");
			const d = String(date.getDate()).padStart(2, "0");
			return `${y}-${m}-${d}`;
		}
		// Weekday header row
		const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const headerRow = document.createElement("div");
		headerRow.className =
			"grid grid-cols-7 w-full text-center text-sm font-medium border-b border-gray-200";
		weekDays.forEach(day => {
			const cell = document.createElement("div");
			cell.className = "py-2";
			cell.textContent = day;
			headerRow.appendChild(cell);
		});
		grid.appendChild(headerRow);
		// ✅ Normalize events and holidays into this.holidays
		const allEvents = this.holidays || [];
		const eventList = allEvents.filter(ev => ev.doctype === "Event");
		const holidayList = allEvents.filter(ev => ev.doctype === "Holiday");
		const appointmentList = allEvents.filter(ev => ev.doctype === "Appointment");
		const customCalendarList = allEvents.filter(ev => ev.doctype === "Custom Calendar");
		// Month grid (7×6 = 42 cells)
		const monthGrid = document.createElement("div");
		monthGrid.className =
			"grid grid-cols-7 grid-rows-6 w-full h-auto border-l border-t border-gray-200";
		for (let i = 0; i < 42; i++) {
			const cell = document.createElement("div");
			cell.className =
				"border-r border-b border-gray-200 p-1 flex flex-col h-full";
			cell.style.minHeight = "100px";
			let dayNum,
				isCurrentMonth = true,
				cellDate;
			if (i < firstDay) {
				// Previous month
				dayNum = daysInPrevMonth - firstDay + i + 1;
				isCurrentMonth = false;
				cellDate = new Date(year, month - 1, dayNum);
			} else if (i >= firstDay + daysInMonth) {
				// Next month
				dayNum = i - (firstDay + daysInMonth) + 1;
				isCurrentMonth = false;
				cellDate = new Date(year, month + 1, dayNum);
			} else {
				// Current month
				dayNum = i - firstDay + 1;
				cellDate = new Date(year, month, dayNum);
			}
			const cellDateStr = formatLocalDate(cellDate);
			// Label (day number)
			const label = document.createElement("div");
			label.className = "text-xs font-medium mb-1 flex justify-center";
			label.textContent = dayNum;
			if (!isCurrentMonth) {
				label.classList.add("text-gray-400");
			}
			// Highlight today
			if (
				isCurrentMonth &&
				dayNum === today.getDate() &&
				month === today.getMonth() &&
				year === today.getFullYear()
			) {
				label.className =
					"flex items-center justify-center mx-auto text-xs font-medium mb-1 bg-blue-500 text-white rounded-full w-8 h-8";
			}
			cell.appendChild(label);
			// Events container
			const eventsContainer = document.createElement("div");
			eventsContainer.className = "flex-1 overflow-hidden space-y-0.5";
			// ✅ Filter matching events/holidays by date
			const cellEvents = eventList.filter(
				ev => ev.start.split(" ")[0] === cellDateStr
			);
			const cellHolidays = holidayList.filter(
				h => h.start === cellDateStr
			);
			const cellAppointments = appointmentList.filter(
				a => a.start_date === cellDateStr
			);
			const dayCustomCalendars = customCalendarList.filter(
				c => c.start.split(" ")[0] === cellDateStr
			);
			let maxVisible = 2;
			// Render events
			cellEvents.slice(0, maxVisible).forEach(ev => {
				const evDiv = document.createElement("div");
				evDiv.className =
					"bg-green-200 px-1 rounded text-xs truncate cursor-pointer";
				evDiv.textContent = ev.title;

				// ✅ Show title, start, name in message
				evDiv.onclick = () => {
					let msg = `
						<b>Title:</b> ${ev.title}<br>
						<b>Name:</b> ${ev.name || ""}<br>
						<b>Start:</b> ${ev.start || ""}<br>
						<b>End:</b> ${ev.end || ""}
					`;
					frappe.msgprint(msg);
				};

				eventsContainer.appendChild(evDiv);
			});
			// Render holidays
			cellHolidays.slice(0, maxVisible).forEach(h => {
				const hDiv = document.createElement("div");
				hDiv.className =
					"bg-red-200 px-1 rounded text-xs truncate cursor-pointer";
				hDiv.textContent = h.title;
				hDiv.onclick = () =>
					frappe.msgprint(`Holiday: ${h.title || "Holiday"}`);
				eventsContainer.appendChild(hDiv);
			});
			// Render appointments
			cellAppointments.slice(0, maxVisible).forEach(a => {
				const aDiv = document.createElement("div");
				aDiv.className =
					"bg-blue-200 px-1 rounded text-xs truncate cursor-pointer";
				aDiv.textContent = a.title;
				aDiv.onclick = () => {
					let msg = `
						<b>Title:</b> ${a.title}<br>
						<b>Customer:</b> ${a.customer || ""}<br>
						<b>Start Date:</b> ${a.start_date || ""}<br>
						<b>Start Time:</b> ${a.start_time || ""}<br>
						<b>End Date:</b> ${a.end_date || ""}<br>
						<b>End Time:</b> ${a.end_time || ""}<br>
						<b>Email:</b> ${a.customer_email || ""}
					`;
					frappe.msgprint(msg);
				};
				eventsContainer.appendChild(aDiv);
			});
			// ✅ Custom Calendar Entries
			dayCustomCalendars.forEach(c => {
				const cDiv = document.createElement("div");
				cDiv.className =
					"bg-yellow-200 px-1 rounded text-xs truncate cursor-pointer";
				cDiv.textContent = c.title;
				cDiv.onclick = () =>
					frappe.msgprint(`
						<b>Custom Calendar:</b> ${c.title}<br>
						<b>Start Date:</b> ${c.start}<br>
						<b>End Date:</b> ${c.end}
					`);
				eventsContainer.appendChild(cDiv);
			});
			// More link if too many
			const totalItems = cellEvents.length + cellHolidays.length + cellAppointments.length + dayCustomCalendars.length;
			if (totalItems > maxVisible) {
				const moreLink = document.createElement("div");
				moreLink.className = "text-blue-600 text-xs cursor-pointer";
				moreLink.textContent = `+${totalItems - maxVisible} more`;
				moreLink.onclick = () => {
					const details = [
						...cellEvents.map(e => `${e.title}`),
						...cellHolidays.map(h => `${h.title}`),
						...cellAppointments.map(a => `${a.title}`),
						...dayCustomCalendars.map(c => `${c.title}`)
					].join("<br>");
					frappe.msgprint(`On ${cellDate.toDateString()}:<br>` + details);
				};
				eventsContainer.appendChild(moreLink);
			}
			cell.appendChild(eventsContainer);
			monthGrid.appendChild(cell);
			// ✅ Add click handler for empty cell
			cell.onclick = e => {
				if (e.target.closest(".bg-green-200, .bg-red-200, .bg-blue-200, .bg-yellow-200, .text-blue-600")) return;

				const start = new Date(cellDate);
				start.setHours(0, 0, 0, 0);
				const end = new Date(start);
				end.setMinutes(end.getMinutes() + 30);

				frappe.ui.form.make_quick_entry("Appointment", null, () => { });

				const pad = n => String(n).padStart(2, "0");
				const timeStr = dt => `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
				const custom_start_date = frappe.datetime.obj_to_str(start);
				const custom_start_time = timeStr(start);
				const custom_end_date = frappe.datetime.obj_to_str(end);
				const custom_end_time = timeStr(end);
				const combined_start = `${custom_start_date} ${custom_start_time}`;
				const combined_end = `${custom_end_date} ${custom_end_time}`;

				let attempts = 0;
				const poll = setInterval(() => {
					attempts++;
					const qe = frappe.quick_entry;
					if (!qe) { if (attempts > 60) clearInterval(poll); return; }

					const frm = qe.frm;
					const dialog = qe.dialog;
					if (!frm && !dialog) { if (attempts > 60) clearInterval(poll); return; }

					// Compute current datetime here for scheduled_time
					const scheduled_time = frappe.datetime.now_datetime();

					const setOn = (obj, key, val) => {
						if (!obj || !obj.fields_dict) return false;
						const f = obj.fields_dict[key];
						if (!f) return false;
						if (typeof obj.set_value === "function") { try { obj.set_value(key, val); obj.refresh_field && obj.refresh_field(key); } catch (e) { } return true; }
						if (f && typeof f.set_value === "function") { try { f.set_value(val); } catch (e) { } return true; }
						if (f && f.$input) { try { f.$input.val(val).trigger("change"); } catch (e) { } return true; }
						return false;
					};

					// Field name candidates
					const startDateKeys = ["custom_start_date", "start_date"];
					const startTimeKeys = ["custom_start_time", "start_time"];
					const endDateKeys = ["custom_end_date", "end_date"];
					const endTimeKeys = ["custom_end_time", "end_time"];
					const scheduledKeys = ["scheduled_time", "custom_scheduled_time", "schedule_date_time"];

					startDateKeys.forEach(k => setOn(frm, k, custom_start_date) || setOn(dialog, k, custom_start_date));
					startTimeKeys.forEach(k => setOn(frm, k, custom_start_time) || setOn(dialog, k, custom_start_time));
					endDateKeys.forEach(k => setOn(frm, k, custom_end_date) || setOn(dialog, k, custom_end_date));
					endTimeKeys.forEach(k => setOn(frm, k, custom_end_time) || setOn(dialog, k, custom_end_time));
					scheduledKeys.forEach(k => setOn(frm, k, scheduled_time));

					clearInterval(poll);
				}, 100);
			};


		}

		grid.appendChild(monthGrid);
	}




	updateMonthLabel() {
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		const dayNames = [
			"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
		];
		const month = this.currentDate.getMonth();
		const year = this.currentDate.getFullYear();
		const day = this.currentDate.getDate();
		const weekday = dayNames[this.currentDate.getDay()];
		let label = "";
		if (this.currentView === "month") {
			// Example: "August 2025"
			label = `${monthNames[month]} ${year}`;
		}
		else if (this.currentView === "week") {
			// Example: "Aug 25 – Aug 31, 2025"
			const startOfWeek = new Date(this.currentDate);
			startOfWeek.setDate(this.currentDate.getDate() - this.currentDate.getDay());
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(startOfWeek.getDate() + 6);
			label = `${monthNames[startOfWeek.getMonth()].slice(0, 3)} ${startOfWeek.getDate()} – ` +
				`${monthNames[endOfWeek.getMonth()].slice(0, 3)} ${endOfWeek.getDate()}, ${year}`;
		}
		else if (this.currentView === "day") {
			// Example: "Wednesday, Aug 27, 2025"
			label = `${weekday}, ${monthNames[month].slice(0, 3)} ${day}, ${year}`;
		}
		document.getElementById("month-label").textContent = label;
	}

	renderTimeLabels(startHour = 0, endHour = 24) {
		const container = document.getElementById("time-labels");
		container.innerHTML = "";
		for (let hour = startHour; hour < endHour; hour++) {
			const div = document.createElement("div");
			div.className = "h-12 relative";
			div.innerHTML = `
            <div class="absolute w-full top-0 left-0 text-right pr-2 text-xs sm:text-sm">
                ${this.formatHour(hour)}
            </div>
        `;
			container.appendChild(div);
		}
	}

	formatHour(hour) {
		const period = hour >= 12 ? "PM" : "AM";
		const displayHour = hour % 12 === 0 ? 12 : hour % 12;
		return `${displayHour} ${period}`;
	}

	renderWeekHeader(date = new Date()) {
		const parent = document.getElementById("grid-lines").parentElement;
		if (parent) {
			parent.className = "grid grid-cols-8 relative";
		}

		const header = document.getElementById("week-header");
		const allDayRow = document.getElementById("all-day-row");

		header.innerHTML = '<div class=""></div>'; // time col
		allDayRow.innerHTML = '<div class="border-r mb-1"></div>'; // time col

		// Find Sunday of the current week
		const sunday = new Date(date);
		sunday.setDate(sunday.getDate() - sunday.getDay());

		const today = new Date();
		const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

		// Separate data
		const allItems = this.holidays || [];
		const eventList = allItems.filter(ev => ev.doctype === "Event");
		const holidayList = allItems.filter(h => h.doctype === "Holiday");
		const AppointmentList = allItems.filter(a => a.doctype === "Appointment");
		const customCalendarList = allItems.filter(c => c.doctype === "Custom Calendar");

		for (let i = 0; i < 7; i++) {
			const day = new Date(sunday);
			day.setDate(sunday.getDate() + i);

			// --- HEADER CELL ---
			const dayDiv = document.createElement("div");
			dayDiv.className = "py-2 cursor-pointer";
			const isToday =
				day.getDate() === today.getDate() &&
				day.getMonth() === today.getMonth() &&
				day.getFullYear() === today.getFullYear();

			dayDiv.innerHTML = `
			<div class="flex flex-col items-center">
				<span class="text-xs sm:text-sm week-label-size">${weekdays[i]}</span>
				<span class="mt-1 flex items-center justify-center rounded-full week-number-size
					${isToday ? "bg-blue-600 text-white" : ""}">
					${day.getDate()}
				</span>
			</div>
		`;

			dayDiv.addEventListener("click", () => {
				this.switchView("day", { date: day, source: "dayHeaderClick" });
			});

			header.appendChild(dayDiv);

			// --- ALL DAY CELL ---
			const dayKey = [
				day.getFullYear(),
				String(day.getMonth() + 1).padStart(2, "0"),
				String(day.getDate()).padStart(2, "0")
			].join("-");

			let maxVisible = 1; // 👈 You can increase this to 2 or 3 if needed

			const allDayDiv = document.createElement("div");
			allDayDiv.className =
				"border-r flex flex-col items-start justify-start px-1 space-y-0.5";
			// 👆 using flex-col instead of flex-wrap + overflow-hidden

			// Collect all items for the day
			const items = [
				...holidayList.filter(h => (h.start || "").split("T")[0] === dayKey)
					.map(h => ({ type: "Holiday", title: h.title, data: h })),
				...eventList.filter(ev => (ev.start || "").split(" ")[0] === dayKey)
					.map(ev => ({ type: "Event", title: ev.title, data: ev })),
				...AppointmentList.filter(a => (a.start_date || "").split("T")[0] === dayKey)
					.map(a => ({ type: "Appointment", title: a.title, data: a })),
				...customCalendarList.filter(c => (c.start || "").split(" ")[0] === dayKey)
					.map(c => ({ type: "Custom", title: c.title, data: c }))
			];

			// Render visible items
			items.slice(0, maxVisible).forEach(item => {
				const span = document.createElement("span");
				span.className = {
					Holiday: "bg-red-200 text-red-700",
					Event: "bg-green-200 text-green-700",
					Appointment: "bg-purple-200 text-purple-700",
					Custom: "bg-yellow-200 text-yellow-700"
				}[item.type] + " text-xs px-2 py-0.5 rounded ellipsis cursor-pointer";

				span.textContent = item.title;
				span.title = item.title;
				span.onclick = e => {
					e.stopPropagation();
					frappe.msgprint(`${item.title}`);
				};
				allDayDiv.appendChild(span);
			});

			// Add "+more" link if hidden items exist
			if (items.length > maxVisible) {
				const moreLink = document.createElement("div");
				moreLink.className = "text-blue-600 text-xs cursor-pointer";
				moreLink.textContent = `+${items.length - maxVisible} more`;
				moreLink.onclick = () => {
					//const details = items.map(it => `${it.type}: ${it.title}`).join("<br>");
					const details = items.map(it => it.title).join("<br>");
					frappe.msgprint(`on ${day.toDateString()}:<br>` + details);
				};
				allDayDiv.appendChild(moreLink);
			}

			// ✅ Empty all-day cell → create Appointment
			allDayDiv.addEventListener("click", (e) => {
				if (e.target.tagName === "SPAN" || e.target.classList.contains("text-blue-600")) return;
				e.stopPropagation();

				const start = new Date(day);
				start.setHours(0, 0, 0, 0);

				const end = new Date(start);
				end.setHours(23, 59, 59, 0);
			});

			allDayRow.appendChild(allDayDiv);
		}
	}

	renderGridLines(viewStartHour = 0, viewEndHour = 24) {
		const grid = document.getElementById("grid-lines");
		if (!grid) return;
		grid.innerHTML = "";
		const hourHeight = 48; // px per hour

		// Highlight today's column
		if (this.currentView === "week" && this.todayIndex !== undefined) {
			const todayHighlight = document.createElement("div");
			todayHighlight.className =
				"absolute top-0 h-full bg-blue-50 opacity-50 pointer-events-none";
			todayHighlight.style.left = `calc(${this.todayIndex} * (100% / 7))`;
			todayHighlight.style.width = `calc(100% / 7)`;
			grid.appendChild(todayHighlight);
		}

		// Vertical lines (7 cols)
		if (this.currentView === "week") {
			for (let i = 1; i < 7; i++) {
				const vLine = document.createElement("div");
				vLine.className = "absolute top-0 h-full border-r border-gray-200 pointer-events-none";
				vLine.style.left = `calc(${i} * (100% / 7))`;
				grid.appendChild(vLine);
			}
		}

		// Horizontal hour lines
		const totalHours = viewEndHour - viewStartHour;
		for (let i = 0; i <= totalHours; i++) {
			const hLine = document.createElement("div");
			hLine.className = "absolute left-0 w-full border-t border-gray-200 pointer-events-none";
			hLine.style.top = `${i * hourHeight}px`;
			grid.appendChild(hLine);
		}

		// Ensure fixed height
		grid.style.height = `${totalHours * hourHeight}px`;
		//Render events in the grid
		if (this.currentView === "week") {
			const sunday = new Date(this.currentDate);
			sunday.setDate(sunday.getDate() - sunday.getDay());

			const allItems = this.holidays || [];
			const eventList = allItems.filter(ev => ev.doctype === "Event");
			const AppointmentList = allItems.filter(a => a.doctype === "Appointment");
			const customCalendarList = allItems.filter(c => c.doctype === "Custom Calendar");

			// merge lists
			const timedItems = [
				...eventList.map(ev => ({ type: "Event", title: ev.title, start: ev.start, end: ev.end })),
				...AppointmentList.map(a => ({ type: "Appointment", title: a.title, start: a.start_date_time, end: a.end_date_time })),
				...customCalendarList.map(c => ({ type: "Custom", title: c.title, start: c.start, end: c.end }))
			];

			timedItems.forEach(item => {
				if (!item.start) return;
				const startDate = new Date(item.start);
				const endDate = item.end ? new Date(item.end) : new Date(startDate.getTime() + 30 * 60000);

				// only render if within this week
				const dayIndex = startDate.getDay();
				if (dayIndex < 0 || dayIndex > 6) return;

				const minutesFromStart = (startDate.getHours() - viewStartHour) * 60 + startDate.getMinutes();
				const eventTop = (minutesFromStart / 60) * hourHeight;
				const durationMinutes = (endDate - startDate) / 60000;
				const eventHeight = (durationMinutes / 60) * hourHeight;

				const eventDiv = document.createElement("div");
				eventDiv.className =
					"absolute px-1 py-0.5 rounded text-xs cursor-pointer overflow-hidden";
				eventDiv.style.top = `${eventTop}px`;
				eventDiv.style.height = `${eventHeight}px`;
				eventDiv.style.left = `calc(${dayIndex} * (100% / 7) + 2px)`; // +2px padding
				eventDiv.style.width = `calc((100% / 7) - 4px)`;

				// coloring by type
				const colors = {
					Event: "bg-green-200 text-green-800 border border-green-300",
					Appointment: "bg-purple-200 text-purple-800 border border-purple-300",
					Custom: "bg-yellow-200 text-yellow-800 border border-yellow-300"
				};
				eventDiv.className += " " + (colors[item.type] || "bg-gray-200");

				eventDiv.textContent = item.title;
				eventDiv.title = `${item.type}: ${item.title}`;

				eventDiv.onclick = e => {
					e.stopPropagation();
					frappe.msgprint(`${item.title}<br>
					${startDate.toLocaleString()} - ${endDate.toLocaleString()}`);
				};

				grid.appendChild(eventDiv);
			});
		}
		// ✅ Grid click → new Appointment
		if (!this._gridClickHandler) {
			this._gridClickHandler = (e) => {
				const rect = grid.getBoundingClientRect();
				const clickY = e.clientY - rect.top;
				const clickX = e.clientX - rect.left;
				if (clickY < 0 || clickY > rect.height) return;

				const minutesFromTop = (clickY / hourHeight) * 60;
				const absoluteMinutes = viewStartHour * 60 + minutesFromTop;
				const clickedHour = Math.floor(absoluteMinutes / 60);
				const clickedMinute = Math.floor(absoluteMinutes % 60);

				let clickedDate = null;
				if (this.currentView === "day") {
					clickedDate = new Date(this.currentDate);
				} else if (this.currentView === "week") {
					const dayIndexRaw = Math.floor((clickX / rect.width) * 7);
					const dayIndex = Math.max(0, Math.min(6, dayIndexRaw));
					const weekDates = this.getVisibleWeekDates && this.getVisibleWeekDates();
					if (Array.isArray(weekDates) && weekDates[dayIndex]) {
						clickedDate = new Date(weekDates[dayIndex]);
					}
				}
				if (!clickedDate) return;

				const start = new Date(clickedDate);
				start.setHours(clickedHour, clickedMinute, 0, 0);
				const end = new Date(start);
				end.setMinutes(end.getMinutes() + 30);
				// open quick entry (no-op callback)
				frappe.ui.form.make_quick_entry("Appointment", null, () => { });

				// helpers
				const pad = n => String(n).padStart(2, "0");
				const timeStr = dt => `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
				const custom_start_date = frappe.datetime.obj_to_str(start); // "YYYY-MM-DD"
				const custom_start_time = timeStr(start);                    // "HH:MM:00"
				const custom_end_date = frappe.datetime.obj_to_str(end);
				const custom_end_time = timeStr(end);
				const combined_start = `${custom_start_date} ${custom_start_time}`.trim();
				const combined_end = `${custom_end_date} ${custom_end_time}`.trim();
				const scheduled_time = frappe.datetime.now_datetime();

				// poll for quick entry to appear, then set values
				let attempts = 0;
				const poll = setInterval(() => {
					attempts++;
					const qe = frappe.quick_entry;
					if (!qe) {
						if (attempts > 60) clearInterval(poll); // timeout ~6s
						return;
					}
					const frm = qe.frm;
					const dialog = qe.dialog;
					// console.log("QE frm keys:", frm && Object.keys(frm.fields_dict || {}));
					// console.log("QE dialog keys:", dialog && Object.keys(dialog.fields_dict || {}));

					if (!frm && !dialog) {
						if (attempts > 60) clearInterval(poll);
						return;
					}
					const setOn = (objFrmOrDialog, key, val) => {
						if (!objFrmOrDialog) return false;
						// frm case: use set_value API
						if (objFrmOrDialog.fields_dict && objFrmOrDialog.fields_dict[key]) {
							// if obj is frm: use set_value(fieldname, value)
							if (typeof objFrmOrDialog.set_value === "function") {
								try { objFrmOrDialog.set_value(key, val); objFrmOrDialog.refresh_field && objFrmOrDialog.refresh_field(key); } catch (e) { }
							} else {
								// dialog field object fallback
								const f = objFrmOrDialog.fields_dict[key];
								if (f && f.set_value) { try { f.set_value(val); } catch (e) { } }
								else if (f && f.$input) { try { f.$input.val(val); } catch (e) { } }
							}
							return true;
						}
						return false;
					};
					// Try several common fieldname variants (date, time, combined datetime)
					const datetimeKeys = ["starts_on", "start_datetime", "start_date_time", "start", "start_date_time", "start_date_time"];
					const startDateKeys = ["custom_start_date", "start_date", "from_date", "date"];
					const startTimeKeys = ["custom_start_time", "start_time", "from_time", "time"];
					const endDateKeys = ["custom_end_date", "end_date", "to_date"];
					const endTimeKeys = ["custom_end_time", "end_time", "to_time"];
					const combinedKeys = ["starts_on", "start", "start_datetime", "start_date_time", "start_date_time"];
					const scheduledKeys = ["scheduled_time", "custom_scheduled_time", "schedule_date_time"];
					for (const k of combinedKeys) {
						if (setOn(frm, k, combined_start) || setOn(dialog, k, combined_start)) break;
					}
					startDateKeys.some(k => setOn(frm, k, custom_start_date) || setOn(dialog, k, custom_start_date));
					startTimeKeys.some(k => setOn(frm, k, custom_start_time) || setOn(dialog, k, custom_start_time));
					endDateKeys.some(k => setOn(frm, k, custom_end_date) || setOn(dialog, k, custom_end_date));
					endTimeKeys.some(k => setOn(frm, k, custom_end_time) || setOn(dialog, k, custom_end_time));
					scheduledKeys.some(k => setOn(frm, k, scheduled_time) || setOn(dialog, k, scheduled_time));
					clearInterval(poll);
				}, 100);

			};
			grid.addEventListener("click", this._gridClickHandler);
		}
	}

	/*frappe.ui.form.make_quick_entry("Appointment", null, () => {
		const qe = frappe.quick_entry;
		if (!qe || !qe.frm) return;

		const pad = (n) => String(n).padStart(2, "0");
		const timeStr = (dt) => `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;

		// 🔑 Wait for the form to load before setting values
		qe.frm.once("after_load", () => {
			qe.frm.set_value("custom_start_date", frappe.datetime.obj_to_str(start));
			qe.frm.set_value("custom_start_time", timeStr(start));
			qe.frm.set_value("custom_end_date", frappe.datetime.obj_to_str(end));
			qe.frm.set_value("custom_end_time", timeStr(end));

			console.log("✅ Values applied after Quick Entry loaded:", {
				custom_start_date: frappe.datetime.obj_to_str(start),
				custom_start_time: timeStr(start),
				custom_end_date: frappe.datetime.obj_to_str(end),
				custom_end_time: timeStr(end),
			});
		});
	});**/


	// 🔑 Attach click handler once (for creating new events)
	/*if (!this._gridClickHandler) {
		this._gridClickHandler = (e) => {
			if (e.target && e.target.closest && e.target.closest(".fc-event, .event")) return;

			const rect = grid.getBoundingClientRect();
			const clickY = e.clientY - rect.top;
			const clickX = e.clientX - rect.left;
			if (clickY < 0 || clickY > rect.height) return;

			const minutesFromTop = (clickY / hourHeight) * 60;
			const absoluteMinutes = viewStartHour * 60 + minutesFromTop;
			const clickedHour = Math.floor(absoluteMinutes / 60);
			const clickedMinute = Math.floor(absoluteMinutes % 60);

			let clickedDate = null;
			if (this.currentView === "day") {
				clickedDate = new Date(this.currentDate);
			} else if (this.currentView === "week") {
				const dayIndexRaw = Math.floor((clickX / rect.width) * 7);
				const dayIndex = Math.max(0, Math.min(6, dayIndexRaw));
				const weekDates = this.getVisibleWeekDates && this.getVisibleWeekDates();
				if (Array.isArray(weekDates) && weekDates[dayIndex]) {
					clickedDate = new Date(weekDates[dayIndex]);
				}
			}

			if (!clickedDate) return;

			const start = new Date(clickedDate);
			start.setHours(clickedHour, clickedMinute, 0, 0);

			const end = new Date(start);
			end.setMinutes(end.getMinutes() + 30);

			this.showNewAppointmentModal(start, end);
		};

		grid.addEventListener("click", this._gridClickHandler);
	}*/


	showNewAppointmentModal(start, end) {
		// helpers
		const pad = (n) => String(n).padStart(2, "0");
		const formatTimeShort = (dt) => `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; // "HH:MM"
		const ensureSeconds = (timeStr) => {
			if (!timeStr) return "00:00:00";
			// if "HH:MM" -> add ":00", if "HH:MM:SS" -> keep
			return timeStr.length === 5 ? `${timeStr}:00` : timeStr;
		};
		// parse "YYYY-MM-DD" and "HH:MM" or "HH:MM:SS" into a local Date
		const parseDateTime = (dateStr, timeStr) => {
			const [y, m, d] = (dateStr || "").split("-").map(Number);
			const parts = (timeStr || "00:00:00").split(":").map(Number);
			const hh = parts[0] || 0;
			const mm = parts[1] || 0;
			const ss = parts[2] || 0;
			return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
		};

		const d = new frappe.ui.Dialog({
			title: "New Appointment",
			fields: [
				{
					fieldname: "appointment_with",
					fieldtype: "Link",
					label: "Appointment With",
					options: "DocType",
					default: "Lead"
				},
				{
					fieldname: "customer_name",
					fieldtype: "Data",
					label: "Name"
				},
				{
					fieldname: "party",
					fieldtype: "Dynamic Link",
					label: "Party",
					options: "appointment_with"
				},
				{
					fieldname: "custom_phone_number",
					fieldtype: "Data",
					label: "Phone Number"
				},
				{
					fieldname: "customer_email",
					fieldtype: "Data",
					label: "Email"
				},
				{
					fieldname: "custom_start_date",
					fieldtype: "Date",
					label: "Start Date",
					default: frappe.datetime.obj_to_str(start),
					reqd: 1
				},
				{
					fieldname: "custom_start_time",
					fieldtype: "Time",
					label: "Start Time",
					default: formatTimeShort(start),
					reqd: 1
				},
				{
					fieldname: "custom_end_date",
					fieldtype: "Date",
					label: "End Date",
					default: frappe.datetime.obj_to_str(end),
					reqd: 1
				},
				{
					fieldname: "custom_end_time",
					fieldtype: "Time",
					label: "End Time",
					default: formatTimeShort(end),
					reqd: 1
				},
				{
					fieldname: "custom_details",
					fieldtype: "Long Text",
					label: "Details"
				},
				{
					fieldname: "scheduled_time",
					fieldtype: "Datetime",
					label: "Scheduled Time",
					default: frappe.datetime.now_datetime(),
				},
				{
					fieldname: "status",
					fieldtype: "Select",
					label: "Status",
					options: "Open\nUnverified\nClosed",
					default: "Open"
				}
			],
			primary_action_label: "Create",
			primary_action: (vals) => {
				// basic validation
				if (!vals.custom_start_date || !vals.custom_start_time ||
					!vals.custom_end_date || !vals.custom_end_time) {
					frappe.msgprint("Start date/time and End date/time are required");
					return;
				}

				// Normalize times to include seconds
				const startTimeWithSec = ensureSeconds(vals.custom_start_time);
				const endTimeWithSec = ensureSeconds(vals.custom_end_time);

				// Create Date objects locally for validation
				const startDT = parseDateTime(vals.custom_start_date, startTimeWithSec);
				const endDT = parseDateTime(vals.custom_end_date, endTimeWithSec);

				if (isNaN(startDT.getTime()) || isNaN(endDT.getTime())) {
					frappe.msgprint("Invalid start or end date/time");
					return;
				}
				if (endDT <= startDT) {
					frappe.msgprint("End time must be after Start time");
					return;
				}

				const argsData = {
					details: vals.custom_details || "",
					start_date: vals.custom_start_date,
					start_time: startTimeWithSec,
					end_date: vals.custom_end_date,
					end_time: endTimeWithSec,
					customer_email: vals.customer_email || "",
					customer_name: vals.customer_name || "",
					phone_number: vals.custom_phone_number || "",
					appointment_with: vals.appointment_with || "",
					party: vals.party || "",
					status: vals.status,
					scheduled_time: vals.scheduled_time
				};

				// 🔎 Log to console for debugging
				console.log("Sending args to backend:", argsData);

				frappe.call({
					method: "renewal_module.custom_module.page.custom_calendar_view.custom_calendar_view.create_event",
					args: argsData,
					callback: (r) => {
						if (r.message && r.message.status === "success") {
							d.hide();
							if (this.loadAndRender) this.loadAndRender();
							else this.refreshCalendar();
							frappe.msgprint("Appointment saved: " + r.message.appointment_name);
						} else {
							const msg = (r.message && r.message.message) ? r.message.message : "Failed to save appointment";
							frappe.msgprint(msg);
						}
					},
					error: (err) => {
						console.error("Server error:", err);
						frappe.msgprint("Server error: " + (err?.message || JSON.stringify(err)));
					}
				});


			}

		});

		console.log("Showing new appointment modal for", start, end);
		d.show();
	}


	getVisibleWeekDates() {
		const start = new Date(this.currentDate);
		start.setDate(start.getDate() - start.getDay()); // Sunday
		const week = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			week.push(d);
		}
		return week;
	}

	renderCurrentTimeIndicator(startHour = 0, currentDate = null, visibleWeekDates = []) {
		let indicator = document.getElementById("time-indicator");
		// If missing, create it dynamically
		if (!indicator) {
			const grid = document.getElementById("grid-lines");
			if (!grid) return;
			indicator = document.createElement("div");
			indicator.id = "time-indicator";
			indicator.className = "absolute h-0.5 bg-red-500";
			grid.appendChild(indicator);
		}
		const now = new Date();
		const todayStr = now.toISOString().split("T")[0];
		// === Hide logic for Day view ===
		if (this.currentView === "day") {
			const selectedStr = currentDate?.toISOString().split("T")[0];
			if (selectedStr !== todayStr) {
				indicator.style.display = "none";
				return;
			}
		}

		if (this.currentView === "week") {
			const todayStr = now.toISOString().split("T")[0];
			const weekStrs = (visibleWeekDates || []).map(d => d.toISOString().split("T")[0]);
			//console.log("Today:", todayStr, "Week days:", weekStrs);
			if (!weekStrs.includes(todayStr)) {
				indicator.style.display = "none";
				return;
			}
			// If inside week → show
			indicator.style.display = "block";
			const todayIndex = weekStrs.indexOf(todayStr);
			const columnWidth = 100 / weekStrs.length;
			indicator.style.left = `calc(${todayIndex} * ${columnWidth}%)`;
			indicator.style.width = `calc(${columnWidth}%)`;
		}
		// If we’re here → indicator should be visible
		indicator.style.display = "block";
		const hourHeight = 48; // px per hour
		const minutesSinceStart = (now.getHours() - startHour) * 60 + now.getMinutes();
		const topPosition = (minutesSinceStart / 60) * hourHeight;
		indicator.style.top = `${topPosition}px`;

		if (this.currentView === "week") {
			const todayIndex = visibleWeekDates.findIndex(d => d.toISOString().split("T")[0] === todayStr);
			if (todayIndex >= 0) {
				const columnWidth = 100 / visibleWeekDates.length;
				indicator.style.left = `calc(${todayIndex} * ${columnWidth}%)`;
				indicator.style.width = `calc(${columnWidth}%)`;
			}
		} else {
			indicator.style.left = "0";
			indicator.style.width = "100%";
		}
	}

}

frappe.customer_calendar_view_page = {
	body: `
        <div class="flex h-screen overflow-hidden bg-gray-100">
            <!-- Sidebar -->
            <aside id="sidebar" class="hidden lg:flex w-64 m-2 rounded border-gray-200 p-2 flex flex-col h-full overflow-y-auto">
                <!-- Create Button -->
                <div class="relative inline-block" id="create-menu">
                    <button
                        id="create-btn"
                        class="flex items-center justify-center space-x-2 px-4 py-3 mb-6 border border-gray-300 bg-white rounded-full shadow-md hover:bg-gray-100 w-full">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                        fill="currentColor" class="w-5 h-5 text-gray-600">
                        <path fill-rule="evenodd"
                            d="M12 5.25a.75.75 0 01.75.75v5.25H18a.75.75 0 010 1.5h-5.25V18a.75.75 0 01-1.5 0v-5.25H6a.75.75 0 010-1.5h5.25V6a.75.75 0 01.75-.75z"
                            clip-rule="evenodd" />
                        </svg>
                        <span class="font-medium sm:text-sm">Create</span>
                    </button>
                    <!-- Dropdown -->
                    <div id="create-dropdown"
                        class="absolute left-0 w-48 bg-white border border-gray-200 rounded-lg shadow-lg hidden z-50">
                        <ul class="py-1 text-sm text-gray-700">
							<li><a id="btn-new-appt" class="block px-4 py-2 hover:bg-gray-100">Appointment</a></li>
                            <li><a id="btn-new-event" class="block px-4 py-2 hover:bg-gray-100">Task</a></li>
							<li><a id="btn-new-cal" class="block px-4 py-2 hover:bg-gray-100">Custom Calendar</a></li>
                        </ul>
                    </div>
                </div>

                <!-- Small Calendar -->
                <div class="mb-6">
                <div class="flex items-center justify-between mb-2">
                    <h2 id="mini-calendar-month" class="font-medium text-xs sm:text-sm"></h2>
                    <div class="flex space-x-2">
                    <button id="mini-prev" class="p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button id="mini-next" class="p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                    </div>
                </div>
                <div id="mini-calendar-grid" class="grid grid-cols-7 gap-1 text-center text-xs sm:text-sm"></div>
                </div>

                <!-- My calendars -->
                <div class="mb-5">
                <div class="flex items-center justify-between mb-2 p-2 border border-gray-300 bg-white rounded-full cursor-pointer" id="toggle-my-calendars">
                    <h2 class="sidebar-label text-gray-600">My calendars</h2>
                    <button id="collapse-btn" class="rounded-full hover:bg-gray-200 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                        fill="currentColor" class="sidebar-icon text-gray-500 transition-transform duration-200" id="collapse-icon">
                        <path fill-rule="evenodd"
                        d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z"
                        clip-rule="evenodd" />
                    </svg>
                    </button>
                </div>

                <div id="calendar-list" class="p-2 space-y-2 text-sm text-gray-700">
                    <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked class="form-checkbox text-blue-500 rounded focus:ring-blue-500">
                    <span class="text-xs sm:text-sm">Jhansi Amballa</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked class="form-checkbox text-green-500 rounded focus:ring-green-500">
                    <span class="text-xs sm:text-sm">Birthdays</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked class="form-checkbox text-red-500 rounded focus:ring-red-500">
                    <span class="text-xs sm:text-sm">ERPNext Calendar</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked class="form-checkbox text-blue-500 rounded focus:ring-blue-500">
                    <span class="text-xs sm:text-sm">Tasks</span>
                    </label>
                </div>
                </div>

                <!-- Other calendars -->
                <div class="mb-6">
                <div class="flex items-center justify-between border border-gray-300 bg-white rounded-full p-2">
                    <h2 class="sidebar-label text-gray-600">Other calendars</h2>
                    <button class="p-1 rounded-full hover:bg-gray-200 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                        class="w-5 h-5 text-gray-500">
                        <path fill-rule="evenodd"
                        d="M12 5.25a.75.75 0 01.75.75v5.25H18a.75.75 0 010 1.5h-5.25V18a.75.75 0 01-1.5 0v-5.25H6a.75.75 0 010-1.5h5.25V6a.75.75 0 01.75-.75z"
                        clip-rule="evenodd" />
                    </svg>
                    </button>
                </div>
                </div>
            </aside>

            <!-- Mobile overlay (click to close) -->
            <div id="sidebar-overlay" class="fixed inset-0 bg-black/40 z-70 hidden"></div>


            <!-- Main -->
            <main class="flex-1 flex flex-col p-2 m-2 rounded overflow-hidden bg-white">
                <!-- Top Bar -->
                <div class="flex items-center justify-between p-2 border-b border-gray-200 bg-white flex-wrap">
					<div class="flex items-center space-x-2 sm:space-x-4">
						<button id="toggle-sidebar"
							class="px-3 py-2 text-sm font-medium rounded-lg border hover:bg-gray-100 block lg:hidden">
							☰
						</button>
						<button id="btn-today" class="px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border" style="background-color:#012739; color:#fff;">
						Today
						</button>
						<button id="btn-prev" class="p-2 rounded-full hover:bg-gray-100 transition-colors">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 sm:w-5 h-4 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
						</button>
						<button id="btn-next" class="p-2 rounded-full hover:bg-gray-100 transition-colors">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 sm:w-5 h-4 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
						</button>
						<!--<span id="month-label" class="month-label-size font-semibold ellipsis"></span>-->
					</div>

					<div class="flex items-center space-x-2 sm:space-x-4 mt-2 sm:mt-0">
						<span id="month-label" class="month-label-size font-semibold ellipsis"></span>
					</div>
					

					<div class="flex items-center space-x-2 sm:space-x-4 mt-2 sm:mt-0">
						<div class="relative">
							<select id="view-selector" class="px-3 py-2 text-xs sm:text-sm font-medium border border-gray-300 rounded-lg" style="background-color:#012739; color:#fff;">
								<option class="bg-white text-gray-900" value="day">Day</option>
								<option class="bg-white text-gray-900" value="week" selected>Week</option>
								<option class="bg-white text-gray-900" value="month">Month</option>
							</select>
						</div>
					</div>
                </div>

                <!-- Scrollable Calendar Area -->
                <div id="scrollable-calendar" class="flex-1 overflow-y-auto relative">
                    <div id="header-corner" class="sticky top-0 z-20 bg-white border-b border-gray-200">
                        <div id="week-header" class="grid grid-cols-8 text-sm text-center">
                            <div class="border-r flex items-center justify-center text-xs text-gray-500">Time</div>
                        </div>
                        <div id="all-day-row" class="grid grid-cols-8 text-xs text-center">
                            <div class="border-r flex items-center justify-center text-gray-400">All-day</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-8 relative">
                        <div id="time-labels" class="border-r text-xs text-right pr-1"></div>
                        <div id="grid-lines" class="col-span-7 relative">
                            <div id="time-indicator" class="absolute h-0.5 bg-red-500"></div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `
};


/**async renderDayView(date) {
	const parent = document.getElementById("grid-lines").parentElement;
	if (parent) {
		parent.className = "grid grid-cols-8 relative";
	}
	const header = document.getElementById("week-header");
	const allDayRow = document.getElementById("all-day-row");
	// --- Reset to 2-column grid for Day view ---
	header.className = "grid grid-cols-8 text-sm text-center sm:text-sm";
	allDayRow.className = "grid grid-cols-8 text-xs text-center";
	// Clear both header and all-day row
	header.innerHTML = "";
	allDayRow.innerHTML = "";
	// --- HEADER ---
	// Left cell → Time label
	const timeCell = document.createElement("div");
	timeCell.className = "border-r flex items-center justify-center text-xs text-gray-500";
	timeCell.textContent = "";
	header.appendChild(timeCell);
	// Right cell → Day header
	const dayCell = document.createElement("div");
	dayCell.className = "flex flex-col items-center justify-start py-1";
	const weekday = document.createElement("span");
	weekday.className = "text-sm font-medium sm:text-sm";
	weekday.textContent = date.toLocaleDateString("en-US", { weekday: "short" });
	dayCell.appendChild(weekday);
	const dateCircle = document.createElement("div");
	const today = new Date();
	if (
		date.getDate() === today.getDate() &&
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear()
	) {
		// ✅ Highlight current date
		dateCircle.className =
			"mt-1 w-8 h-8 flex items-center justify-center day-number sm:text-sm rounded-full bg-blue-600 text-white";
	} else {
		// Normal day (no highlight)
		dateCircle.className =
			"mt-1 w-8 h-8 flex items-center justify-center day-number text-gray-700 sm:text-sm";
	}
	dateCircle.textContent = date.getDate();
	dayCell.appendChild(dateCircle);
	header.appendChild(dayCell);
	// --- ALL-DAY ROW ---
	// Left cell → "All-day" label
	const allDayLabel = document.createElement("div");
	allDayLabel.className = "border-r flex items-center sm:text-sm justify-center text-gray-400";
	allDayLabel.textContent = "";
	allDayRow.appendChild(allDayLabel);
	// Right cell → Events + Holidays
	const allDayDiv = document.createElement("div");
	allDayDiv.className = "flex flex-wrap items-center justify-start space-x-1 px-2 truncate";
	//const dayStr = date.toISOString().split("T")[0];
	const dayStr = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0")
	].join("-");

	const allItems = this.holidays || [];
	// Separate
	const holidayList = allItems.filter(h => h.doctype === "Holiday");
	const eventList = allItems.filter(ev => ev.doctype === "Event");
	const appointmentList = allItems.filter(a => a.doctype === "Appointment");
	const customCalendarList = allItems.filter(c => c.doctype === "Custom Calendar");
	// ✅ Holidays
	const dayHolidays = holidayList.filter(h => (h.start || "").split("T")[0] === dayStr);
	dayHolidays.forEach(h => {
		const span = document.createElement("span");
		span.className =
			"bg-red-200 text-red-700 text-xs sm:text-sm px-2 py-0.5 rounded ellipsis cursor-pointer";
		span.textContent = h.title;
		span.title = h.title;
		span.onclick = (e) => {
			e.stopPropagation();
			frappe.msgprint(`<b>Holiday:</b> ${h.title}<br><b>Date:</b> ${h.start}`);
		};
		allDayDiv.appendChild(span);
	});
	// ✅ Events (all-day or starting this day)
	const dayEvents = eventList.filter(ev => (ev.start || "").split(" ")[0] === dayStr);
	dayEvents.forEach(ev => {
		const span = document.createElement("span");
		span.className =
			"bg-green-200 text-green-700 text-xs sm:text-sm px-2 py-0.5 rounded ellipsis cursor-pointer";
		span.textContent = ev.title;
		span.title = ev.title;
		span.onclick = (e) => {
			e.stopPropagation();
			frappe.msgprint(`
				<b>Event:</b> ${ev.title}<br>
				<b>Name:</b> ${ev.name}<br>
				<b>Start:</b> ${ev.start}<br>
				<b>End:</b> ${ev.end || "N/A"}
			`);
		};
		allDayDiv.appendChild(span);
	});
	// ✅ Appointments
	const dayAppointments = appointmentList.filter(a => (a.start_date || "").split("T")[0] === dayStr);
	dayAppointments.forEach(a => {
		const span = document.createElement("span");
		span.className =
			"bg-blue-200 text-blue-700 text-xs sm:text-sm px-2 py-0.5 rounded ellipsis cursor-pointer";
		span.textContent = a.title;
		span.title = a.title;
		span.onclick = (e) => {
			e.stopPropagation();
			frappe.msgprint(`
					<b>Appointment:</b> ${a.title}<br>
					<b>Name:</b> ${a.customer}<br>
					<b>Start Date:</b> ${a.start_date}<br>
					<b>Start Time:</b> ${a.start_time || ""}<br>
					<b>End Date:</b> ${a.end_date || ""}<br>
					<b>End Time:</b> ${a.end_time || ""}<br>
					<b>Email:</b> ${a.customer_email || ""}
				`);
		};
		allDayDiv.appendChild(span);
	});
	// ✅ Custom Calendars
	const dayCustomCalendars = customCalendarList.filter(
		c => (c.start || "").split(" ")[0] === dayStr
	);
	dayCustomCalendars.forEach(c => {
		const span = document.createElement("span");
		span.className =
			"bg-yellow-200 text-purple-700 text-xs sm:text-sm px-2 py-0.5 rounded ellipsis cursor-pointer";
		span.textContent = c.title;
		span.title = c.title;
		span.onclick = (e) => {
			e.stopPropagation();
			frappe.msgprint(`
					<b>Custom Calendar:</b> ${c.title}<br>
					<b>Name:</b> ${c.name}<br>
					<b>Start:</b> ${c.start}<br>
					<b>End:</b> ${c.end || "N/A"}
				`);
		};
		allDayDiv.appendChild(span);
	});
	allDayRow.appendChild(allDayDiv);
	// ✅ Add click handler for empty space in all-day row
	allDayDiv.addEventListener("click", (e) => {
		if (e.target.tagName === "SPAN") return; // ignore pills
		e.stopPropagation();
		const start = new Date(date);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setHours(23, 59, 59, 999);
		this.showNewAppointmentModal(start, end);
	});
	// --- GRID + TIME LABELS ---
	this.renderTimeLabels(0, 24);
	this.renderGridLines(0, 24);
}**/

/**renderWeekHeader(date = new Date()) {
	const parent = document.getElementById("grid-lines").parentElement;
	if (parent) {
		parent.className = "grid grid-cols-8 relative";
	}

	const header = document.getElementById("week-header");
	const allDayRow = document.getElementById("all-day-row");

	header.innerHTML = '<div class=""></div>'; // time col
	allDayRow.innerHTML = '<div class="border-r"></div>'; // time col

	// Find Sunday of the current week
	const sunday = new Date(date);
	sunday.setDate(sunday.getDate() - sunday.getDay());

	const today = new Date();
	const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	// Separate data
	const allItems = this.holidays || [];
	const eventList = allItems.filter(ev => ev.doctype === "Event");
	const holidayList = allItems.filter(h => h.doctype === "Holiday");
	const AppointmentList = allItems.filter(a => a.doctype === "Appointment");
	const customCalendarList = allItems.filter(c => c.doctype === "Custom Calendar");

	for (let i = 0; i < 7; i++) {
		const day = new Date(sunday);
		day.setDate(sunday.getDate() + i);

		// --- HEADER CELL ---
		const dayDiv = document.createElement("div");
		dayDiv.className = "py-2 cursor-pointer";
		const isToday =
			day.getDate() === today.getDate() &&
			day.getMonth() === today.getMonth() &&
			day.getFullYear() === today.getFullYear();

		dayDiv.innerHTML = `
			<div class="flex flex-col items-center">
				<span class="text-xs sm:text-sm week-label-size">${weekdays[i]}</span>
				<span class="mt-1 flex items-center justify-center rounded-full week-number-size
					${isToday ? "bg-blue-600 text-white" : ""}">
					${day.getDate()}
				</span>
			</div>
		`;

		dayDiv.addEventListener("click", () => {
			this.switchView("day", { date: day, source: "dayHeaderClick" });
		});

		header.appendChild(dayDiv);

		// --- ALL DAY CELL ---
		//const dayKey = day.toISOString().split("T")[0];
		const dayKey = [
			day.getFullYear(),
			String(day.getMonth() + 1).padStart(2, "0"),
			String(day.getDate()).padStart(2, "0")
		].join("-");

		let maxVisible = 1;

		const allDayDiv = document.createElement("div");
		allDayDiv.className =
			"border-r flex flex-wrap items-start justify-start px-1 space-x-1 space-y-0.5 overflow-hidden";

		// ✅ Holidays
		const dayHolidays = holidayList.filter(
			h => (h.start || "").split("T")[0] === dayKey
		);
		dayHolidays.slice(0, maxVisible).forEach(h => {
			const span = document.createElement("span");
			span.className =
				"bg-red-200 text-red-700 text-xs px-2 py-0.5 rounded ellipsis cursor-pointer";
			span.textContent = h.title;
			span.title = h.title;
			span.onclick = (e) => {
				e.stopPropagation();
				frappe.msgprint(`<b>Holiday:</b> ${h.title}<br><b>Date:</b> ${h.start}`);
			};
			allDayDiv.appendChild(span);
		});

		// ✅ Events (all-day only)
		const dayEvents = eventList.filter(
			ev => (ev.start || "").split(" ")[0] === dayKey
		);
		dayEvents.slice(0, maxVisible).forEach(ev => {
			const span = document.createElement("span");
			span.className =
				"bg-green-200 text-green-700 text-xs px-2 py-0.5 rounded ellipsis cursor-pointer";
			span.textContent = ev.title;
			span.title = ev.title;
			span.onclick = (e) => {
				e.stopPropagation();
				frappe.msgprint(`
					<b>Event:</b> ${ev.title}<br>
					<b>Name:</b> ${ev.name}<br>
					<b>Start:</b> ${ev.start}<br>
					<b>End:</b> ${ev.end || "N/A"}
				`);
			};
			allDayDiv.appendChild(span);
		});

		const dayAppointments = AppointmentList.filter(
			a => (a.start_date || "").split("T")[0] === dayKey
		);
		dayAppointments.slice(0, maxVisible).forEach(a => {
			const span = document.createElement("span");
			span.className =
				"bg-purple-200 text-purple-700 text-xs px-2 py-0.5 rounded ellipsis cursor-pointer";
			span.textContent = a.title;
			span.title = a.title;
			span.onclick = (e) => {
				e.stopPropagation();
				frappe.msgprint(`
					<b>Appointment:</b> ${a.title}<br>
					<b>Name:</b> ${a.customer}<br>
					<b>Start Date:</b> ${a.start_date}<br>
					<b>Start Time:</b> ${a.start_time || ""}<br>
					<b>End Date:</b> ${a.end_date || ""}<br>
					<b>End Time:</b> ${a.end_time || ""}<br>
					<b>Email:</b> ${a.customer_email || ""}
				`);
			};
			allDayDiv.appendChild(span);
		});
		// ✅ Custom Calendar Entries
		const dayCustomCalendars = customCalendarList.filter(
			c => (c.start || "").split(" ")[0] === dayKey
		);

		dayCustomCalendars.slice(0, maxVisible).forEach(c => {
			const span = document.createElement("span");
			span.className =
				"bg-yellow-200 text-yellow-700 text-xs px-2 py-0.5 rounded ellipsis cursor-pointer";
			span.textContent = c.title;
			span.title = c.title;
			span.onclick = (e) => {
				e.stopPropagation();
				frappe.msgprint(`
						<b>Custom Calendar:</b> ${c.title}<br>
						<b>Start Date:</b> ${c.start}<br>
						<b>End Date:</b> ${c.end}
					`);
			};
			allDayDiv.appendChild(span);
		});

		const totalItems = dayHolidays.length + dayEvents.length + dayAppointments.length + dayCustomCalendars.length;
		if (totalItems > maxVisible) {
			const moreLink = document.createElement("div");
			moreLink.className = "text-blue-600 text-xs cursor-pointer";
			moreLink.textContent = `+${totalItems - maxVisible} more`;
			moreLink.onclick = () => {
				const details = [
					...dayEvents.map(e => `Event: ${e.title}`),
					...dayHolidays.map(h => `Holiday: ${h.title || "Holiday"}`),
					...dayAppointments.map(a => `Appointment: ${a.title}`),
					...dayCustomCalendars.map(c => `Custom Calendar: ${c.title}`)
				].join("<br>");
				frappe.msgprint(`on ${day.toDateString()}:<br>` + details);
			};
			allDayDiv.appendChild(moreLink);
		}


		// ✅ Click empty area to create event
		allDayDiv.addEventListener("click", (e) => {
			if (e.target.tagName === "SPAN") return; // ignore pills
			e.stopPropagation();

			const start = new Date(day);
			start.setHours(0, 0, 0, 0);

			const end = new Date(start);
			end.setDate(end.getDate() + 1);
			this.showNewAppointmentModal(start, end);
		});

		allDayRow.appendChild(allDayDiv);
	}
}**/

/**renderGridLines(viewStartHour = 0, viewEndHour = 24) {
	const grid = document.getElementById("grid-lines");
	if (!grid) return;
	grid.innerHTML = "";
	const hourHeight = 48; // px per hour

	// Highlight today's column (week view only)
	if (this.currentView === "week" && this.todayIndex !== undefined) {
		const todayHighlight = document.createElement("div");
		todayHighlight.className =
			"absolute top-0 h-full bg-blue-50 opacity-50 pointer-events-none";
		todayHighlight.style.left = `calc(${this.todayIndex} * (100% / 7))`;
		todayHighlight.style.width = `calc(100% / 7)`;
		grid.appendChild(todayHighlight);
	}

	// Vertical lines (7 cols) for week view
	if (this.currentView === "week") {
		for (let i = 1; i < 7; i++) {
			const vLine = document.createElement("div");
			vLine.className = "absolute top-0 h-full border-r border-gray-200 pointer-events-none";
			vLine.style.left = `calc(${i} * (100% / 7))`;
			grid.appendChild(vLine);
		}
	}

	// Horizontal lines (hour rows)
	const totalHours = viewEndHour - viewStartHour;
	for (let i = 0; i <= totalHours; i++) {
		const hLine = document.createElement("div");
		hLine.className = "absolute left-0 w-full border-t border-gray-200 pointer-events-none";
		hLine.style.top = `${i * hourHeight}px`;
		grid.appendChild(hLine);
	}

	// Ensure grid has fixed height
	grid.style.height = `${totalHours * hourHeight}px`;

	// 🔑 Attach click handler safely (only once)
	if (!this._gridClickHandler) {
		this._gridClickHandler = (e) => {
			if (e.target && e.target.closest && e.target.closest(".fc-event, .event")) return;

			const rect = grid.getBoundingClientRect();
			const clickY = e.clientY - rect.top;
			const clickX = e.clientX - rect.left;
			if (clickY < 0 || clickY > rect.height) return;

			const minutesFromTop = (clickY / hourHeight) * 60;
			const absoluteMinutes = viewStartHour * 60 + minutesFromTop;
			const clickedHour = Math.floor(absoluteMinutes / 60);
			const clickedMinute = Math.floor(absoluteMinutes % 60);

			let clickedDate = null;
			if (this.currentView === "day") {
				clickedDate = new Date(this.currentDate);
			} else if (this.currentView === "week") {
				const dayIndexRaw = Math.floor((clickX / rect.width) * 7);
				const dayIndex = Math.max(0, Math.min(6, dayIndexRaw));
				const weekDates = this.getVisibleWeekDates && this.getVisibleWeekDates();
				if (Array.isArray(weekDates) && weekDates[dayIndex]) {
					clickedDate = new Date(weekDates[dayIndex]);
				}
			}

			if (!clickedDate) return;

			const start = new Date(clickedDate);
			start.setHours(clickedHour, clickedMinute, 0, 0);

			const end = new Date(start);
			end.setMinutes(end.getMinutes() + 30);

			this.showNewAppointmentModal(start, end);
		};

		grid.addEventListener("click", this._gridClickHandler);
	}
}**/