import frappe
from frappe.utils import now_datetime,get_datetime
from renewal_module.custom_issue import get_elapsed_working_seconds


def close_active_time_log(doc, agent):
    """Close the currently active time log for a given agent."""
    now = now_datetime()

    for log in doc.time_logs or []:
        if log.user == agent and not log.to_time:
            start = get_datetime(log.from_time)
            duration_seconds = get_elapsed_working_seconds(
                log.user,
                start.strftime("%Y-%m-%d %H:%M:%S")
            )

            # Update in memory so it appears after save
            log.to_time = now
            log.time_duration = duration_seconds

            # If this log already exists in DB, persist changes immediately
            if log.name:
                frappe.db.set_value("Issue Time Log", log.name, {
                    "to_time": now,
                    "time_duration": duration_seconds
                })

            frappe.logger().info(
                f"[close_active_time_log] Closed log for {agent} with duration {duration_seconds} seconds"
            )
            break  # Only one open log per agent



def before_save(doc, method):
    # Close time log if working agent changed
    frappe.msgprint("before_save function")
    if doc.has_value_changed("working_agent") and doc.get_doc_before_save():
        frappe.msgprint("hello")
        previous_agent = doc.get_doc_before_save().working_agent
        frappe.msgprint(f"previous {previous_agent}")
        if previous_agent:
            _close_time_log(doc, previous_agent)

    # Close time log if status changed to Closed
    if doc.status == "Closed":
        _close_time_log(doc, doc.working_agent)


def _close_time_log(doc, agent):
    now = now_datetime()

    for log in doc.time_logs or []:
        if log.user == agent and not log.to_time:
            start = get_datetime(log.from_time)
            duration_seconds = get_elapsed_working_seconds(
                log.user,
                start.strftime("%Y-%m-%d %H:%M:%S")
            )

            # ✅ Set directly on the in-memory child table
            log.to_time = now
            log.time_duration = duration_seconds

            frappe.logger().info(
                f"[before_save] Closing time log for {agent} | to_time={now} | duration={duration_seconds}"
            )



def track_user_time_log(doc, method):
    # frappe.msgprint(f"Hook triggered — Working agent: {doc.working_agent}")
    try:
        now = frappe.utils.now_datetime()

        if not doc.get("__islocal"):
            previous_doc = frappe.get_doc("Issue", doc.name)
            previous_agent = previous_doc.get("working_agent")
            db_agent = frappe.db.get_value("Issue", doc.name, "working_agent")
            current_agent = doc.get("working_agent")
            # frappe.msgprint(f"Previous Agent: {db_agent}, Current Agent: {current_agent}")

            if current_agent != previous_agent:
                # Close previous agent's log
                if previous_agent:
                    for log in doc.time_logs or []:
                        if log.user == previous_agent and not log.to_time:
                            log.to_time = now
                            # log.time_duration = (log.to_time - log.from_time).total_seconds() / 3600
                            start = get_datetime(log.from_time)
                            end = get_datetime(log.to_time)
                            # log.time_duration = int((end - start).total_seconds())
                            log.time_duration = get_elapsed_working_seconds(log.user, start, end)
                            # log.db_set("to_time", log.to_time)
                            # log.db_set("time_duration", log.time_duration)

                # Start new log for current agent
                # if current_agent:
                #     doc.append("time_logs", {
                #         "user": current_agent,
                #         "from_time": now
                #     })
                    doc.set("time_logs", doc.time_logs)  # ✅ Mark as modified
            # ✅ If no previous agent but current agent is set, and no logs exist yet
            elif current_agent and not doc.time_logs and not doc.get("__islocal"):
                # First time assigning an agent
                
                doc.append("time_logs", {
                    "user": current_agent,
                    "from_time": now
                })  
                doc.set("time_logs", doc.time_logs)  # ✅ Mark as modified    
                doc.refresh()
  

        # Close any open logs when status is closed
        if doc.status == "Closed":
            for log in doc.time_logs or []:
                if not log.to_time:
                    log.to_time = now
                    # log.time_duration = (now - log.from_time).total_seconds() / 3600
                    start = get_datetime(log.from_time)
                    end = get_datetime(log.to_time)
                    
                    delta = end - start

                    # Store float hours in duration field
                    # log.time_duration = delta.total_seconds()
                    log.time_duration = get_elapsed_working_seconds(log.user, start, end)

                    # log.time_duration = get_datetime(log.to_time) - get_datetime(log.from_time)
            doc.set("time_logs", doc.time_logs)  # ✅ Mark as modified        

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Issue Time Log Error")





@frappe.whitelist()
def start_time_log(issue):

    user = frappe.session.user
    if not is_working_time_for_user(user):
        frappe.throw("You can only start a time log during working hours on a non-holiday.")

    # frappe.msgprint("helloooooo")
    now = frappe.utils.now_datetime()
    doc = frappe.get_doc("Issue", issue)

    start_date = now.date()  # Gives a date object like 2025-08-12
    start_time = now.time()  # Gives a time object like 09:15:30

    current_user = frappe.session.user

    # Check if user already has an open log
    for log in doc.time_logs or []:
        if log.user == current_user and not log.to_time:
            frappe.throw("You already have an open time log.")

    doc.append("time_logs", {
        "user": current_user,
        "from_time": now,
        "start_date":start_date,
        "start_time":start_time
    })
    doc.set("time_logs", doc.time_logs)
    

    # frappe.msgprint(f"Current Agent: {current_user}")

    # ✅ Save the document to store the log immediately
    doc.save()
    frappe.db.commit()


    # return "Started work at {}".format(now)
    # return "r"


import frappe
from frappe.utils import now_datetime
from datetime import datetime, timedelta

@frappe.whitelist() 
def is_working_time_for_user(user):
    now = now_datetime()
    # weekday = now.strftime("%A")  # Example: 'Monday'

    # Step 1: Find linked Employee and their Shift Type
    employee = frappe.db.get_value("Employee", {"user_id": user}, ["name", "default_shift"], as_dict=True)
    # if not employee or not employee.default_shift:
    #     return False

    if not employee or not employee.default_shift:
        if any(role in frappe.get_roles(frappe.session.user) for role in ['L1 - Tech Support', 'L2 - Tech Support', 'L3 - Tech Support']):
            frappe.throw("You don't have a shift assigned. Contact HR.")


    shift = frappe.get_doc("Shift Type", employee.default_shift)

    # Step 2: Check global holiday list (today’s holiday?)
    holiday_lists = frappe.get_all("Holiday List", filters={
        "from_date": ["<=", now.date()],
        "to_date": [">=", now.date()]
    })

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(holiday_lists)))

    for hl in holiday_lists:
        is_holiday = frappe.db.exists("Holiday", {
            "holiday_date": now.date(),
            "parent": hl.name
        })
        if is_holiday:
            # frappe.msgprint("Holiday")
            # return should_pause_timer(user)
            return False  # Today is a global holiday

    # Step 3: Check shift hours for today
    # for detail in shift.shift_type_details:
    #     if detail.day == weekday:
    #         from_time = detail.from_time
    #         to_time = detail.to_time
    #         if from_time <= now.time() <= to_time:
    #             return True
    # Get working hours from Shift Type
    from_time = shift.start_time
    to_time = shift.end_time

     # Convert if needed
    if isinstance(from_time, timedelta):
        from_time = convert_timedelta_to_time(from_time)
    if isinstance(to_time, timedelta):
        to_time = convert_timedelta_to_time(to_time)

    if from_time and to_time and from_time <= now.time() <= to_time:
        return True
    
    return False  # Not within shift hours


def convert_timedelta_to_time(delta):
    return (datetime.min + delta).time()


@frappe.whitelist()
def should_pause_timer(user):
    return not is_working_time_for_user(user)

def get_open_time_log(user, issue):
    log = frappe.get_all("Issue Time Log", filters={
        "owner": user,
        "parent": issue,
        "to_time": ["is", "not set"]
    }, limit=1)
    return frappe.get_doc("Issue Time Log", log[0].name) if log else None



@frappe.whitelist()
def pause_open_time_log(user):
    frappe.msgprint("Pause open Time Log")
    now = now_datetime()
    
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return

    open_logs = frappe.get_all("Issue Time Log", filters={
        "user": user,
        "to_time": ["is", "not set"]
    })

    for log in open_logs:
        log_doc = frappe.get_doc("Issue Time Log", log.name)

        # ✅ Instead of setting to_time, we mark pause start time
        if not log_doc.pause_start_time:
            log_doc.pause_start_time = now
            log_doc.save(ignore_permissions=True)
    
    frappe.db.commit()



# @frappe.whitelist()
# def add_pause_log(user, issue):
    
    
#     now = now_datetime()
#     frappe.msgprint("Timer Paused1")
#     # Find open time log
#     open_logs = frappe.get_all("Issue Time Log", filters={
#         "user": user,
#         "parent": issue,
#         "to_time": ["is", "not set"]
#     }, limit=1)
#     frappe.msgprint("Timer Paused2")

#     if not open_logs:
#         frappe.msgprint("not Open logs")
#         return
#     frappe.msgprint("Timer Paused3")

#     time_log = open_logs[0].name

#     # Check if there's already an open pause
#     existing_pause = frappe.get_all("Time Log Pause", filters={
#         "time_log": time_log,
#         "parent":issue,
#         "parenttype":"Issue",
#         "pause_end": ["is", "not set"]
#     })
#     frappe.msgprint("Timer Paused4")
#     frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(existing_pause)))
    
#     if not existing_pause:
#         frappe.msgprint("Not Existing")
#         pause = frappe.get_doc({
#             "doctype": "Time Log Pause",
#             "time_log": time_log,
#             "pause_start": now,
#             "parent":issue,
#             "parenttype":"Issue"
#         })
#         pause.insert(ignore_permissions=True)
#         frappe.db.commit()
#     frappe.msgprint("Timer Paused5")    

@frappe.whitelist()
def add_pause_log(user, issue):
    now = now_datetime()
    
    open_logs = frappe.get_all("Issue Time Log", filters={
        "user": user,
        "parent": issue,
        "to_time": ["is", "not set"]
    }, limit=1)

    if not open_logs:
        return

    time_log = open_logs[0].name

    # Check if pause already exists
    existing_pause = frappe.get_all("Time Log Pause", filters={
        "time_log": time_log,
        "pause_end": ["is", "not set"]
    })

    if not existing_pause:
        pause = frappe.get_doc({
            "doctype": "Time Log Pause",
            "time_log": time_log,
            "pause_start": now,
            "parent": issue,  # Important to attach to Issue for child table display
            "parenttype": "Issue",
            "parentfield": "custom_time_log_pause"
        })
        pause.insert(ignore_permissions=True)
        frappe.db.commit()


@frappe.whitelist()
def end_pause_log(user, issue):
    now = now_datetime()

    # Get the open time log
    open_logs = frappe.get_all("Issue Time Log", filters={
        "user": user,
        "parent": issue,
        "to_time": ["is", "not set"]
    }, limit=1)

    if not open_logs:
        return

    time_log = open_logs[0].name

    open_pause = frappe.get_all("Time Log Pause", filters={
        "time_log": time_log,
        "pause_end": ["is", "not set"]
    }, limit=1)

    if open_pause:
        pause_doc = frappe.get_doc("Time Log Pause", open_pause[0].name)
        pause_doc.pause_end = now
        pause_doc.parent = issue
        pause_doc.parenttype = "Issue"
        pause_doc.save(ignore_permissions=True)
        frappe.db.commit()


# def calculate_net_duration(time_log_name):
#     log = frappe.get_doc("Issue Time Log", time_log_name)
#     if not log.to_time:
#         return None

#     total_duration = (log.to_time - log.from_time).total_seconds()

#     pauses = frappe.get_all("Time Log Pause", filters={"time_log": log.name},
#         fields=["pause_start", "pause_end"])

#     pause_duration = sum([
#         (get_datetime(p["pause_end"]) - get_datetime(p["pause_start"])).total_seconds()
#         for p in pauses if p["pause_start"] and p["pause_end"]
#     ])

#     return total_duration - pause_duration



def calculate_net_duration(time_log_name):
    frappe.msgprint("Calculate Net Duration")
    log = frappe.get_doc("Issue Time Log", time_log_name)
    if not log.to_time:
        return None

    from_time = get_datetime(log.from_time)
    to_time = get_datetime(log.to_time)

    # Get working hours from linked Shift Type
    shift = frappe.db.get_value("Shift Type", "Regular Shift", ["start_time", "end_time", "holiday_list"], as_dict=True)
    if not shift:
        frappe.throw("Shift Type is not assigned or does not exist")

    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(shift)))
    start_work = shift.start_time
    end_work = shift.end_time
    holiday_list = shift.holiday_list
    frappe.msgprint(end_work)

    # Get holidays
    holidays = frappe.get_all("Holiday", filters={
        "holiday_date": ["between", [from_time.date(), to_time.date()]],
        "parent": holiday_list
    }, pluck="holiday_date")

    # Initialize net working seconds
    net_seconds = 0

    current_day = from_time.date()
    while current_day <= to_time.date():
        # Skip holidays
        if current_day in holidays:
            current_day += timedelta(days=1)
            continue

        day_start = datetime.combine(current_day, start_work)
        day_end = datetime.combine(current_day, end_work)

        # Calculate overlap between log and working hours
        actual_start = max(from_time, day_start)
        actual_end = min(to_time, day_end)

        if actual_start < actual_end:
            net_seconds += (actual_end - actual_start).total_seconds()

        current_day += timedelta(days=1)

    # Subtract paused durations
    pauses = frappe.get_all("Time Log Pause", filters={"time_log": log.name},
        fields=["pause_start", "pause_end"])

    pause_seconds = sum([
        max(0, (get_datetime(p["pause_end"]) - get_datetime(p["pause_start"])).total_seconds())
        for p in pauses if p["pause_start"] and p["pause_end"]
    ])

    return net_seconds - pause_seconds



