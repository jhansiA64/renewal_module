frappe.pages['calendar'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Calendar',
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
		// 	initialView: 'timeGridWeek',  // or 'timeGridDay' for daily
		// 	height: "auto",
		// 	headerToolbar: {
		// 		left: 'prev,next today',
		// 		center: 'title',
		// 		right: 'dayGridMonth,timeGridWeek,timeGridDay'  // give user the option to switch
		// 	},
		// 	slotMinTime: "06:00:00",  // optional: start from 6AM
		// 	slotMaxTime: "22:00:00",  // optional: end at 10PM
		// 	nowIndicator: true,
		// 	events: function(fetchInfo, successCallback, failureCallback) {
		// 		frappe.call({
		// 			method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.get_unified_calendar_events",
		// 			args: {
		// 				start: fetchInfo.startStr,
		// 				end: fetchInfo.endStr
		// 			},
		// 			callback: function(r) {
		// 				successCallback(r.message || []);
		// 			}
		// 		});
		// 	},

        //     // ✅ Show details on event click
        //     eventClick: function(info) {
        //         const event = info.event;
        //         frappe.msgprint({
        //             title: event.title,
        //             message: `
        //                 <b>Start:</b> ${frappe.datetime.str_to_user(event.startStr)}<br>
        //                 <b>End:</b> ${frappe.datetime.str_to_user(event.endStr)}<br>
        //                 <b>Doctype:</b> ${event.extendedProps.doctype || 'Unknown'}<br>
        //                 <b>Description:</b> ${event.extendedProps.description || 'No description'}
        //             `,
        //             indicator: 'blue'
        //         });
				
        //         // Optional: open document on click
        //         // frappe.set_route('Form', event.extendedProps.doctype, event.id);
        //     }
		// });
		
		const calendar = new FullCalendar.Calendar(calendarEl, {
			initialView: 'timeGridWeek',
			height: "auto",
			slotDuration: "00:15:00",
			slotLabelInterval: "01:00",
			editable: true,
			eventResizableFromStart: true,
			nowIndicator: true,
	
			headerToolbar: {
				left: 'prev,next today',
				center: 'title',
				right: 'dayGridMonth,timeGridWeek,timeGridDay'
			},
			slotMinTime: "06:00:00",
			slotMaxTime: "22:00:00",
	
			// Fetch events
			events: function(fetchInfo, successCallback, failureCallback) {
				frappe.call({
					method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.get_unified_calendar_events",
					args: {
						start: fetchInfo.startStr,
						end: fetchInfo.endStr
					},
					callback: function(r) {
						console.log("Appointments: ",r)
						successCallback(r.message || []);
					}
				});
			},
	
			// Show details on click
			eventClick: function(info) {
				const event = info.event;
				frappe.msgprint({
					title: event.title,
					message: `
						<b>Start:</b> ${frappe.datetime.str_to_user(event.startStr)}<br>
						<b>End:</b> ${frappe.datetime.str_to_user(event.endStr)}<br>
						<b>Doctype:</b> ${event.extendedProps.doctype || 'Unknown'}<br>
						<b>Description:</b> ${event.extendedProps.description || 'No description'}
					`,
					indicator: 'blue'
				});
			},
	
			// Tooltip on hover
			eventDidMount: function(info) {
				info.el.setAttribute("title", `${info.event.title}
	Start: ${frappe.datetime.str_to_user(info.event.startStr)}
	End: ${frappe.datetime.str_to_user(info.event.endStr)}`);
			},
	
			// Drag and drop to reschedule
			eventDrop: function(info) {
				console.log("drop",info.event.extendedProps)
				frappe.call({
					method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.update_event_datetime",
					args: {
						name: info.event.extendedProps.name,
						doctype:info.event.extendedProps.doctype,
						start: info.event.start.toISOString(),  // ✅ use .toISOString()
						end: info.event.end ? info.event.end.toISOString() : null  // ✅ safe check for end
					},
					callback: function() {
						console.log("Event Resche")
						frappe.msgprint("Event rescheduled.");
					}
				});
			},
	
			// Resize to change duration
			eventResize: function(info) {
				console.log("resize",info)
				frappe.call({
					method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.update_event_datetime",
					args: {
						name: info.event.name,
						start: info.event.startStr,
						end: info.event.endStr
					},
					callback: function() {
						frappe.msgprint("Event duration updated.");
					}
				});
			}
		});

	    	
        calendar.render();
    }
};