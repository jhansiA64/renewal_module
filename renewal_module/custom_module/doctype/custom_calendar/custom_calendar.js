// Copyright (c) 2025, Aravind Mandala and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Custom Calendar", {
// 	refresh(frm) {

// 	},
// });


frappe.views.calendar["Custom Calendar"] = {
    field_map: {
        start: "start_date",
        end: "end_date",
        id: "name",
        title: "subject",
        allDay: "all_day"
    },
    options: {
        // Optional: Customize event rendering
        get_events_method: "frappe.desk.calendar.get_events" // or your own method
    },
    get_events: function(start, end, callback) {
        console.log("get events")
        frappe.call({
            method: "frappe.desk.calendar.get_events",
            args: {
                doctype: "Custom Calendar",
                start_date: start,
                end_date: end
            },
            callback: function(r) {
                console.log("r",r.message)
                callback(r.message);
            }
        });
    }
};
