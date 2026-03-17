frappe.pages['appointments-calenda'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}

frappe.pages['appointments-calenda'].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Calendar',
    single_column: true
  });



// ///////////////////////////

// Inject your layout
    // $(frappe.render_template("appointments_calenda", {})).appendTo(page.body);

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


  


// /////////////////////////////




  $(wrapper).find('.container').css({
  "max-width": "100%",
  "width": "100%",
  "padding": "0",
  "margin": "0"
});

  // Layout: Sidebar (left) + Main Calendar (right)
  // <div class="gc-wrap" style="display:flex; gap:12px; height: calc(100vh - 140px);">
    
  $(page.body).html(`
     <div class="gc-page-bg" style="display:flex; gap:12px; height: calc(100vh - 140px); width: 100%;padding: 12px;">
    
     <aside style="width:290px; min-width:260px; border-right:1px solid var(--border-color, #e5e7eb); padding:12px; overflow:auto;">
        

     
       <div id="mini-cal-header" style="font-size: 12px; font-weight: 600; margin-bottom: 4px;"></div>

       

       <div id="mini-cal"></div>




        
        <div style="margin:16px 0 6px; font-weight:600;">Quick Actions</div>

        <div>
  <div class="dropdown">
    <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-toggle="dropdown">
      + Create
    </button>
    <div class="dropdown-menu">
      <a class="dropdown-item" id="btn-new-appt">New Appointment</a>
      <a class="dropdown-item" id="btn-new-event">New Event</a>
      <a class="dropdown-item" id="btn-new-cal">New Calendar</a>
      <div class="dropdown-divider"></div>
  
      <a class="dropdown-item" id="btn-today">Today</a>
    </div>
  </div>
</div>
<div style="margin:12px 0 6px; font-weight:600;">Calendars</div>
        <div id="calendar-filter" style="display:flex; flex-direction:column; gap:6px;"></div>

      </aside>

      <main style="flex:1; overflow:hidden;">
        <div id="main-cal" style="height:100%;"></div>
      </main>
    </div>
  `);


 


  // Load FullCalendar CSS/JS via CDN (global build)
  frappe.require([
    "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.css"
  ], () => {

    // Load Roboto font (Google Calendar uses this)
  $("<link>", {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap"
  }).appendTo("head");

  // Inject custom calendar styles to match Google Calendar
  $(document.head).append(`
    <style>
      .fc {
        font-family: 'Roboto', sans-serif;
        font-size: 14px;
      }

      .fc-toolbar-title {
        font-weight: 500;
        font-size: 20px;
      }

      .fc-button {
        border-radius: 4px;
        padding: 6px 12px;
      }

      .fc .fc-timegrid-slot-label {
        padding-left: 10px;
      }

      .fc-event {
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 13px;
      }

      .fc-daygrid-dot-event {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .fc .fc-button-primary {
        background-color: #1a73e8;
        border-color: #1a73e8;
        color: white;
      }

      .fc-header-toolbar {
        position: sticky;
        top: 0;
        background: white;
        z-index: 10;
        padding: 8px 0;
      }

      .fc-event-dragging {
        opacity: 0.8;
        border: 2px dashed #1a73e8;
      }

      .fc .fc-daygrid-day-number {
        padding: 4px;
        font-weight: 500;
      }

      .fc .fc-col-header-cell-cushion {
        font-weight: 500;
      }







      /* Mini calendar size */
     #mini-cal {
      overflow: hidden !important;
    }

    #mini-cal .fc {
      font-size: 10px;
    }

    /* Shrink header to just first letters */
    #mini-cal .fc-col-header-cell-cushion {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 0;
      text-align: center;
    }

    /* Make grid cell round */
    #mini-cal .fc-daygrid-day {
      text-align: center;
      vertical-align: middle;
      padding: 0 !important;
    }

    #mini-cal .fc-daygrid-day-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    #mini-cal .fc-daygrid-day-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 9px;
      transition: background 0.2s;
    }

    /* Optional hover effect */
    #mini-cal .fc-daygrid-day-number:hover {
      background: #dbeafe; /* light blue on hover */
    }

    /* Optional: Highlight today */
    #mini-cal .fc-day-today .fc-daygrid-day-number {
      background: #2563eb;
      color: white;
      font-weight: bold;
    }

    /* Remove borders and spacing */
    #mini-cal td,
    #mini-cal th {
      height: 24px !important;
      max-height: 24px;
      border: none !important;
      padding: 0 !important;
    }

    #mini-cal .fc-scrollgrid {
      border: none !important;
    }

    #mini-cal-header button {
      padding: 2px 6px;
      line-height: 1;
      border-radius: 4px;
    }

    #mini-cal-header button:hover {
      background-color: #f3f4f6;
    }



      /* Light pastel background (example: very light gray-blue) */
    .gc-page-bg {
      background-color: #f4f6f8;  /* You can change this to match your desired 'light yash' */
    }

    /* Optional: Match sidebar with slightly different tone */
    .gc-page-bg aside {
      background-color: #ffffff;
      border-radius: 8px;
      // box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }

    /* Optional: Soften the main calendar area */
    .gc-page-bg main {
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }

    /* Optional: Remove background gaps in fullcalendar view */
    .fc {
      background-color: transparent;
    }

     body {
      margin: 0;
      padding: 0;
      background-color: #f4f6f8; /* or your preferred 'light yash' color */
    }

    .gc-page-bg {
      width: 100%;
      height: 100%;
      background-color: #f4f6f8;
    }
    </style>
  `);



    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js";
    s.onload = initCalendars;
    document.head.appendChild(s);
  });

  let mainCal, miniCal;
  let activeUsers = new Set(); // filters (assigned_to)
  let userColors = {}; // assigned_to => color

  function initCalendars() {
    const mainEl = document.getElementById("main-cal");
    const miniEl = document.getElementById("mini-cal");

    // Build Mini Calendar (month) in sidebar
    // miniCal = new FullCalendar.Calendar(miniEl, {
    //   initialView: 'dayGridMonth',
    //   height: "auto",
    //   headerToolbar: { left: 'title', center: '', right: 'prev,next' },
    //   dateClick: (info) => {
    //     mainCal.gotoDate(info.date);
    //   }
    // });

    miniCal = new FullCalendar.Calendar(miniEl, {
  initialView: 'dayGridMonth',
  height: 260, // adjust to fit full month
  contentHeight: 260,
  aspectRatio: 1,
  headerToolbar: false,
  dayHeaderContent: (args) => args.date.toLocaleDateString('en', { weekday: 'narrow' }),
  dateClick: (info) => {
    mainCal.gotoDate(info.date); // keep this for interactivity
  }
});

 function updateMiniCalTitle() {
  document.getElementById("mini-cal-header").textContent = miniCal.view.title;
}
miniCal.render();
updateMiniCalTitle();
miniCal.on('datesSet', updateMiniCalTitle);




    // miniCal.render();

    // Build Main Calendar (Google-like header + views)
    mainCal = new FullCalendar.Calendar(mainEl, {
      initialView: 'timeGridWeek',
      height: "100%",
      nowIndicator: true,
      selectable: true,
      editable: true,
      slotMinTime: "06:00:00",
      slotMaxTime: "22:00:00",
      headerToolbar: {
        left: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        center: 'title',
        right: 'prev,next today'
      },

      // Fetch events (filtered by assigned_to if any selected)
      events: (fetchInfo, success, failure) => {
        frappe.call({
          method: "renewal_module.custom_module.page.appointments_calenda.appointments_calenda.get_unified_calendar_events",
          args: {
            start: fetchInfo.startStr,
            end: fetchInfo.endStr,
            users: Array.from(activeUsers)
          },
          callback: (r) => {
            const events = (r.message || []).map(ev => {
              // Ensure consistent color per user
              const who = ev.assigned_to || "unknown";
              if (!userColors[who]) userColors[who] = colorForKey(who);
              return Object.assign({ color: userColors[who] }, ev);
            });
            success(events);
            buildSidebarFilters(events);
          }
        });
      },

      // Create new by selecting a range
      select: (info) => {
        const d = new frappe.ui.Dialog({
          title: "New Appointment",
          fields: [
            { fieldname: "title", fieldtype: "Data", label: "Title", reqd: 1 },
            { fieldname: "assigned_to", fieldtype: "Link", options: "User", label: "Assigned To", reqd: 1 },
            { fieldname: "description", fieldtype: "Small Text", label: "Description" }
          ],
          primary_action_label: "Create",
          primary_action: (vals) => {
            frappe.call({
              method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.create_event",
              args: {
                title: vals.title,
                description: vals.description || "",
                assigned_to: vals.assigned_to,
                start: info.startStr,
                end: info.endStr
              },
              callback: () => {
                d.hide();
                mainCal.refetchEvents();
              }
            });
          }
        });
        d.show();
      },

      // Click to view/edit
      eventClick: (info) => {
        const ev = info.event;
        const name = ev.extendedProps && ev.extendedProps.name;
        const doctype = ev.extendedProps && ev.extendedProps.doctype || "Appointment";

        // Quick preview + open form
        frappe.msgprint({
          title: ev.title,
          message: `
            <div><b>Assigned To:</b> ${frappe.utils.escape_html(ev.extendedProps.assigned_to || "")}</div>
            <div><b>Start:</b> ${frappe.datetime.str_to_user(ev.startStr)}</div>
            <div><b>End:</b> ${frappe.datetime.str_to_user(ev.endStr)}</div>
          `,
          indicator: "blue",
          primary_action: {
            label: "Open",
            action: () => frappe.set_route("Form", doctype, name)
          }
        });
      },

      // Drag to move
      eventDrop: (info) => {
        frappe.call({
          method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.update_event_datetime",
          args: {
            name: info.event.extendedProps.name,
            start: info.event.start.toISOString(),
            end: info.event.end ? info.event.end.toISOString() : null
          },
          callback: () => frappe.show_alert("Event rescheduled", 5)
        });
      },

      // Resize to change duration
      eventResize: (info) => {
        frappe.call({
          method: "renewal_module.custom_module.page.unified_calendar.unified_calendar.update_event_datetime",
          args: {
            name: info.event.extendedProps.name,
            start: info.event.start.toISOString(),
            end: info.event.end ? info.event.end.toISOString() : null
          },
          callback: () => frappe.show_alert("Event duration updated", 5)
        });
      }
    });

    mainCal.render();

    // Quick actions
    $("#btn-today").on("click", () => mainCal.today());
    $("#btn-new-appt").on("click", () => frappe.new_doc("Appointment"));
    $("#btn-new-event").on("click", () => frappe.new_doc("Event"));
    $("#btn-new-cal").on("click", () => frappe.new_doc("Custom Calendar"));
  }

  // Build sidebar calendar filters (per user) with color dots
  function buildSidebarFilters(events) {
    const container = $("#calendar-filter");
    const seen = new Set();
    events.forEach(e => {
      const who = e.assigned_to || "unknown";
      if (seen.has(who)) return;
      seen.add(who);
      if (!userColors[who]) userColors[who] = colorForKey(who);

      const id = `flt-${who.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      if (document.getElementById(id)) return;

      const $row = $(`
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="${id}" checked>
          <span style="width:12px; height:12px; border-radius:50%; background:${userColors[who]}"></span>
          <span>${frappe.utils.escape_html(who)}</span>
        </label>
      `);
      container.append($row);

      activeUsers.add(who);
      $row.find("input").on("change", (ev) => {
        if (ev.target.checked) activeUsers.add(who);
        else activeUsers.delete(who);
        // Refetch filtered events
        if (window.getSelection) window.getSelection().removeAllRanges();
        const view = mainCal.view;
        mainCal.refetchEvents();
      });
    });
  }

  // Deterministic nice color for a key (user/resource)
  function colorForKey(key) {
    const palette = [
      "#4285F4", "#DB4437", "#F4B400", "#0F9D58", "#AB47BC",
      "#00ACC1", "#EF6C00", "#7CB342", "#5C6BC0", "#C0CA33"
    ];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }
};



