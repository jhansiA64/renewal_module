import frappe

def _full_name(user):
    return frappe.db.get_value("User", user, "full_name") or user

@frappe.whitelist()
def get_opportunity_list(q: str = ""):
    params = {}
    where = ""
    if q:
        where = "where (op.name like %(q)s or op.title like %(q)s or op.owner like %(q)s)"
        params["q"] = f"%{q}%"

    rows = frappe.db.sql(f"""
        select op.name, op.title, op.status, op.opportunity_amount,op.sales_stage,
               op.expected_closing, op.owner
        from `tabOpportunity` op
        {where}
        order by op.creation desc
        limit 200
    """, params, as_dict=True)

    for d in rows:
        d["owner_full_name"] = _full_name(d.owner)
    return rows

@frappe.whitelist()
def get_opportunity_details(name: str):
    op = frappe.get_doc("Opportunity", name)
    items = frappe.db.get_all("Opportunity Item",
        filters={"parent": name, "parenttype":"Opportunity"},
        fields=["item_code","item_name","brand","qty","rate","amount","opportunity_type","sales_stage","renewal_id"])

    # brand-wise value
    brand_totals = {}
    for it in items:
        brand = it.get("brand") or "Unknown"
        brand_totals[brand] = brand_totals.get(brand, 0) + float(it.get("amount") or 0)

    brand_pie = {"labels": list(brand_totals.keys()), "values": list(brand_totals.values())}

    # profit split (cost vs profit) using Item.standard_rate as cost basis
    total = sum(float(i.get("amount") or 0) for i in items)
    cost = 0.0
    for it in items:
        std = frappe.db.get_value("Item", it.get("item_code"), "standard_rate") or 0
        cost += float(it.get("qty") or 0) * float(std)
    profit = max(total - cost, 0.0)
    profit_pie = {"labels": ["Cost", "Profit"], "values": [cost, profit]}

    out = op.as_dict()
    out["owner_full_name"] = _full_name(out.get("owner"))
    out["items"] = items
    out["brand_pie"] = brand_pie
    out["profit_pie"] = profit_pie
    return out

# @frappe.whitelist()
# def get_activity(name: str):
#     # Example: pull Tasks referencing the opportunity
#     out = []
#     tasks = frappe.db.get_all("ToDo",
#         filters={"reference_type":"Opportunity","reference_name":name},
#         fields=["name as id","description","status","owner","date as when"],
#         order_by="modified desc", limit=50)
#     for t in tasks:
#         t["type"] = "Task"
#         out.append(t)

#     events = frappe.db.get_all("Event Participants",
#         filters={"reference_doctype":"Opportunity","reference_docname":name},
#         fields=["parent as id"])
#     if events:
#         ev = frappe.db.get_all("Event",
#             filters={"name":["in",[e["id"] for e in events]]},
#             fields=["name as id","subject as description","status","owner","starts_on as when"],
#             order_by="modified desc", limit=50)
#         for e in ev:
#             e["type"] = "Appointment"
#             out.append(e)

#     emails = frappe.db.get_all("Communication",
#         filters={"reference_doctype":"Opportunity","reference_name":name,"communication_medium":"Email"},
#         fields=["name as id","subject as description","status","sender as owner","communication_date as when"],
#         order_by="communication_date desc", limit=50)
#     for em in emails: 
#         em["type"] = "Email"
#         out.append(em)

#     return out[:100]


# your_app/api/opportunity_ui.py

import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def get_activity(name: str):
    out = []

    # Tasks
    tasks = frappe.db.get_all(
        "ToDo",
        filters={"reference_type": "Opportunity", "reference_name": name},
        # NOTE: use a safe alias: activity_when
        fields=[
            "name as id",
            "description",
            "status",
            "owner",
            "`date` as activity_when",  # backticks for the column named 'date'
        ],
        order_by="modified desc",
        limit=50,
    )
    for t in tasks:
        t["type"] = "Task"
        out.append(t)

    # Events (Appointments)
    participants = frappe.db.get_all(
        "Event Participants",
        filters={"reference_doctype": "Opportunity", "reference_docname": name},
        fields=["parent as id"],
        limit=50,
    )
    if participants:
        ev_ids = [p["id"] for p in participants]
        events = frappe.db.get_all(
            "Event",
            filters={"name": ["in", ev_ids]},
            fields=[
                "name as id",
                "subject as description",
                "owner",
                "status",
                "starts_on as activity_when",
            ],
            order_by="modified desc",
            limit=50,
        )
        for e in events:
            e["type"] = "Appointment"
            out.append(e)

    # Emails (Communication)
    emails = frappe.db.get_all(
        "Communication",
        filters={
            "reference_doctype": "Opportunity",
            "reference_name": name,
            "communication_medium": "Email",
        },
        fields=[
            "name as id",
            "subject as description",
            "sender as owner",
            "communication_date as activity_when",
            "status",
        ],
        order_by="communication_date desc",
        limit=50,
    )
    for c in emails:
        c["type"] = "Email"
        out.append(c)

    # Calls (optional Call List)
    if frappe.db.exists("DocType", "Call List"):
        calls = frappe.db.get_all(
            "Call List",
            filters={ "custom_opportunity": name},
            fields=[
                "name as id",
                "subject as description",
                "owner",
                "status",
                "start_date as activity_when",
            ],
            order_by="modified desc",
            limit=50,
        )
        for cl in calls:
            cl["type"] = "Call"
            out.append(cl)

    # Optional: sort in Python (descending)
    out.sort(key=lambda x: x.get("activity_when") or now_datetime(), reverse=True)
    return out[:100]


@frappe.whitelist()
def create_activity(type: str, opportunity: str, when: str=None, owner: str=None, notes: str=""):
    if type == "task":
        doc = frappe.get_doc({
            "doctype":"ToDo",
            "description": notes or f"Task for {opportunity}",
            "reference_type":"Opportunity",
            "reference_name": opportunity,
            "allocated_to": owner or frappe.session.user,
            "date": (when or "")[:10],
            "status":"Open"
        }).insert(ignore_permissions=True)
    elif type == "event":
        doc = frappe.get_doc({
            "doctype":"Event",
            "subject": notes or f"Appointment for {opportunity}",
            "starts_on": when,
            "event_participants":[{"reference_doctype":"Opportunity","reference_docname":opportunity}]
        }).insert(ignore_permissions=True)
    elif type == "email":
        doc = frappe.get_doc({
            "doctype":"Communication",
            "communication_medium":"Email",
            "reference_doctype":"Opportunity",
            "reference_name": opportunity,
            "subject": f"Email Log: {opportunity}",
            "content": notes or "",
            "status":"Linked"
        }).insert(ignore_permissions=True)
    elif type == "call":
        if frappe.db.exists("DocType","Call List"):
            doc = frappe.get_doc({
                "doctype":"Call List",
                "subject": notes or f"Call for {opportunity}",
                "reference_doctype":"Opportunity",
                "reference_name": opportunity,
                "call_date": when
            }).insert(ignore_permissions=True)
        else:
            doc = frappe.get_doc({
                "doctype":"Comment",
                "comment_type":"Info",
                "reference_doctype":"Opportunity",
                "reference_name": opportunity,
                "content": f"Call: {notes or ''}"
            }).insert(ignore_permissions=True)
    else:
        frappe.throw("Unknown activity type")

    frappe.db.commit()
    return {"name": doc.name}




    page = int(page or 1)
    page_size = int(page_size or 8)
    sort_dir = "asc" if (str(sort_dir).lower() == "asc") else "desc"

    # Map allowed sort keys to DB columns
    sort_map = {
        "name": "name",
        "stage": "coalesce(sales_stage, status)",
        "status": "status",
        "opportunity_amount": "opportunity_amount",
        "expected_closing": "expected_closing",
    }
    sort_col = sort_map.get(sort_by, "name")

    # Build filters / where
    where = ["docstatus < 2"]
    vals = {}

    if q:
        where.append("""(
              name like %(q)s
           or  title like %(q)s
           or  subject like %(q)s
           or  owner like %(q)s
           or  party_name like %(q)s
        )""")
        vals["q"] = f"%{q}%"

    if stage:
        where.append("(sales_stage = %(stage)s or status = %(stage)s)")
        vals["stage"] = stage

    if status:
        where.append("status = %(status)s")
        vals["status"] = status

    if priority:
        where.append("priority = %(priority)s")
        vals["priority"] = priority

    where_sql = " where " + " and ".join(where) if where else ""

    total = frappe.db.sql(f"select count(*) from `tabOpportunity` {where_sql}", vals)[0][0]

    offset = max(0, (page - 1) * page_size)

    rows = frappe.db.sql(f"""
        select
            name, title, subject, party_name, customer_name,
            contact_person, contact_display, contact_email,
            sales_stage, status, priority, lead_source,
            opportunity_amount, expected_closing,
            owner, (select full_name from `tabUser` where name = t.owner) as owner_full_name
        from `tabOpportunity` t
        {where_sql}
        order by {sort_col} {sort_dir}
        limit {page_size} offset {offset}
    """, vals, as_dict=True)

    return {"data": rows, "total_count": total}






