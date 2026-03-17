// frappe.pages['unified-calendar'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'None',
// 		single_column: true
// 	});
// }


frappe.pages['unified-calendar'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Unified Calendar',
        single_column: true
    });

	// ✅ Add buttons
    page.add_action_item("New Appointment", () => {
        frappe.new_doc("Appointment");
    });
    page.add_action_item("New Event", () => {
        frappe.new_doc("Event");
    });
    page.add_action_item("New Custom Calendar", () => {
        frappe.new_doc("Custom Calendar");  // use your actual DocType name
    });

    // Add calendar container
    const calendar_area = $(`<div id="unified-calendar" style="min-height: 700px; margin-top: 20px;"></div>`);
    page.body.append(calendar_area);


    // Add required CSS
    frappe.require([
        "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css"
    ], () => {
        const calendar_area = $(`<div id="unified-calendar" style="min-height: 700px; margin-top: 20px;"></div>`);
        page.body.append(calendar_area);

        // Load FullCalendar JS from CDN
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js";
        script.onload = () => render_calendar();
        document.head.appendChild(script);
    });

    function render_calendar() {
        const calendarEl = document.getElementById('unified-calendar');
        // const calendar = new FullCalendar.Calendar(calendarEl, {
        //     initialView: 'dayGridMonth',
        //     height: "auto",
        //     events: function(fetchInfo, successCallback, failureCallback) {
        //         frappe.call({
        //             method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.get_unified_calendar_events",
		// 			args: {
        //                 start: fetchInfo.startStr,
        //                 end: fetchInfo.endStr
        //             },
        //             callback: function(r) {
        //                 successCallback(r.message || []);
        //             }
        //         });
        //     }
        // });

		const calendar = new FullCalendar.Calendar(calendarEl, {
			initialView: 'timeGridWeek',  // or 'timeGridDay' for daily
			height: "auto",
			headerToolbar: {
				left: 'prev,next today',
				center: 'title',
				right: 'dayGridMonth,timeGridWeek,timeGridDay'  // give user the option to switch
			},
			slotMinTime: "06:00:00",  // optional: start from 6AM
			slotMaxTime: "22:00:00",  // optional: end at 10PM
			nowIndicator: true,
			events: function(fetchInfo, successCallback, failureCallback) {
				frappe.call({
					method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.get_unified_calendar_events",
					args: {
						start: fetchInfo.startStr,
						end: fetchInfo.endStr
					},
					callback: function(r) {
						successCallback(r.message || []);
					}
				});
			}
		});
		
        calendar.render();
    }
};