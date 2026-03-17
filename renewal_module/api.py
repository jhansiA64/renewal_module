import frappe
from frappe import auth
from frappe import _

def get_renewals(doc,event):
    
    doc.set("active_renewals", [])
    doc.set("new_renewals", [])
    
    active_list = frappe.db.get_list("Renewal List",filters={"customer_name":doc.name,"status":"Active"},fields=['name'],page_length="*",order_by="creation ASC")
    if active_list:
        for each in active_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            doc.append("active_renewals",{
                'item' : each_data.product_name,
                'quantity': each_data.total_quantity,
                'start_date':each_data.start_date,
                'end_date':each_data.end_date,
                'renewal_id':each_data.name
            })
    new_list = frappe.db.get_list("Renewal List",filters={"customer_name":doc.name,"status":"New Opp"},fields=['name'],page_length="*",order_by="creation ASC")
    if new_list:
        for each in new_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            doc.append("new_renewals",{
                'item' : each_data.product_name,
                'quantity': each_data.total_quantity,
                'start_date':each_data.start_date,
                'end_date':each_data.end_date,
                'renewal_id':each_data.name
            })        
    # doc.save()

def show_error(doc,event):
    if doc.is_new():
        frappe.throw("error")
    else:
        frappe.msgprint("else stage")    

@frappe.whitelist( allow_guest=True )
def login(usr, pwd):
    try:
        login_manager = frappe.auth.LoginManager()
        login_manager.authenticate(user=usr, pwd=pwd)
        login_manager.post_login()
    except frappe.exceptions.AuthenticationError:
        frappe.clear_messages()
        frappe.local.response["message"] = {
            "success_key":0,
            "message":"Authentication Error!"
        }

        return

    api_generate = generate_keys(frappe.session.user)
    user = frappe.get_doc('User', frappe.session.user)

    frappe.response["message"] = {
        "success_key":1,
        "message":"Authentication success",
        "sid":frappe.session.sid,
        "api_key":user.api_key,
        "api_secret":api_generate,
        "username":user.username,
        "email":user.email
    }



def generate_keys(user):
    user_details = frappe.get_doc('User', user)
    api_secret = frappe.generate_hash(length=15)

    if not user_details.api_key:
        api_key = frappe.generate_hash(length=15)
        user_details.api_key = api_key

    user_details.api_secret = api_secret
    user_details.save()

    return api_secret


@frappe.whitelist()
def get_renewals_for_custom_ids(renewal_ids):
    #if not renewal_ids:
    #    return []
    #renewal_list = frappe.get_all('Renewal List',filters={'name':['in',renewal_ids]},
    #                fields=['name as renewal list'])
    #return renewal_list 
                          
    if isinstance(renewal_ids,str):
        try:
            renewal_ids = frappe.parse_json(renewal_ids)
        except Exception as e:
            frappe.throw(_('renewal_ids must be a list.'))
    if not isinstance(renewal_ids,list):
        frappe.throw(_("renewal_ids must be a list."))

    try:
        renewal_list = frappe.get_all('Renewal List',
        filters={'name':['in',renewal_ids]},
        fields=['name']
        )              
        return renewal_list
    except Exception as e:
        frappe.log_error(message=str(e),title="Error in fetching renewals")
        frappe.throw(_("there was an isssue fetching the renewal data."))    


##cof margin table code
import json 
import frappe

@frappe.whitelist()
def update_margin_table(custom_order_form,method=None):
    try:
        doc=frappe.get_doc("Customer Order Form",customer_order_form)
        frappe.msgprint(f"loaded cof number:{doc.name}")

        margin_updated = Flase

        for item in doc.items:
            actual_item_code = item.actual_item_code
            frappe.msgprint(f"processing item:{actual_item_code},rate:{item.rate},amount:{item.amount}")
            existing_margin_entry = None

            for margin_entry in doc.custom_magin_table:
                if margin_entry.item_code == actual_item_code:
                    existing_margin_entry = margin_entry
                    break

            if existing_margin_entry :
                if (existing_margin_entry.selleing_rate != item.rate or existing_margin_entry.selleing_amount !=item.amount
                   or existing_margin_entry.buying_rate != item.purchase_rate):
                   frappe.msgprint(f"updating margin entry for item:{actual_item_code}")
                   existing_margin_entry.selleing_rate = item.rate
                   existing_margin_entry.selleing_amount = item.amount
                   existing_margin_entry.buying_rate = item.purchase_rate

                   margin_updated = True


            else:
                frappe.msgprint(f"creating new marginentry for item:{actual_item_code}")
                margin_entry = {
                    'item_code':actual_item_code,
                    'selleing_rate':item.rate,
                    'selleing_amount':item.amount,
                    'buying_rate':item.purchase_rate
                }            
                doc.append('custom_magin_table',margin_entry)
                margin_updated = True

        if margin_updated:
            frappe.msgprint("changes detected.saving document")
            doc.save(ignore_permissions=True)

            frappe.db.commit()
            frappe.msgprint("margin table updated successfully") 

    except Exception as e:
        frappe.log_error(frappe.get_traceback(),"updated margin table error")   
        frappe.msgprint(f"An Error occcured:{str(e)}")     


#issue
import frappe
import base64

@frappe.whitelist(allow_guest=True)
def create_issue():
    try:
        data = frappe.local.form_dict
        attachment = frappe.request.files.get("attachment")

        # Validate mandatory fields
        if not data.get("subject") or not data.get("customer"):
            frappe.throw("Subject and Customer are mandatory fields.")

        # Create the Issue document
        issue = frappe.get_doc({
            "doctype": "Issue",
            "subject": data.get("subject"),
            "status": data.get("status", "Open"),
            "customer": data.get("customer"),
            "description": data.get("description"),
            "priority":data.get("priority")
        })
        issue.insert()

        # Save attachment if provided
        if attachment:
            _file = frappe.get_doc({
                "doctype": "File",
                "file_name": attachment.filename,
                "attached_to_doctype": "Issue",
                "attached_to_name": issue.name,
                "content": attachment.stream.read(),
                "is_private": 0,
            })
            _file.save()

        frappe.db.commit()
        return {"message": f"Issue {issue.name} created successfully."}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Issue Creation Failed")
        frappe.throw(f"An error occurred: {str(e)}")

@frappe.whitelist()
def get_profile_data():
    user = frappe.session.user  # Fetch the current logged-in user
    if user == "Guest":
        frappe.throw(_("You need to be logged in to edit your profile."))

    user_doc = frappe.get_doc("User", user)  # Fetch the User document
    return {
        "first_name": user_doc.first_name,
        "middle_name": user_doc.middle_name or "",
        "last_name": user_doc.last_name,
        "phone": user_doc.phone or "",
        "mobile_no": user_doc.mobile_no or "",
        "user_image": user_doc.user_image or ""  # Add image field
    }


@frappe.whitelist()
def save_profile_data(first_name, middle_name, last_name, phone, mobile_no,user_image):
    user = frappe.session.user  # Fetch the current logged-in user
    if user == "Guest":
        frappe.throw(_("You need to be logged in to save your profile."))

    user_doc = frappe.get_doc("User", user)
    user_doc.first_name = first_name
    user_doc.middle_name = middle_name
    user_doc.last_name = last_name
    user_doc.phone = phone
    user_doc.mobile_no = mobile_no
    if user_image:
        user_doc.user_image = user_image  # Save the image file path
    user_doc.save()
    frappe.db.commit()
    return {"message":("Profile updated successfully.")}






@frappe.whitelist()
def get_custom_calendar_events(start, end):
    frappe.msgprint("Hello")
    from frappe.utils import get_datetime

    start = get_datetime(start)
    end = get_datetime(end)

    events = frappe.get_all(
        "Custom Calendar",
        fields=["name", "subject", "start_date", "end_date", "all_day"],
        filters={"start_date": ["between", [start, end]]}
    )

    return [
        {
            "name": e.name,
            "title": e.subject,
            "start": e.start_date,
            "end": e.end_date,
            "allDay": bool(e.all_day),
            "doctype": "Custom Calendar"
        }
        for e in events
    ]


# @frappe.whitelist()
# def get_customers_with_sales(filters=None, page=1, page_size=20, min_amount=0, max_amount=999999999):
#     """
#     Return customers with aggregated sales_amount (SUM of Sales Invoice.grand_total) sorted descending by sales_amount.
#     Supports pagination and basic filters: name (like), sales_person, owner, territory, industry.

#     Args:
#         filters (str|dict): JSON string or dict of filter values (keys: name, sales_person, owner, territory, industry)
#         page (int): 1-based page number
#         page_size (int): number of records per page
#         min_amount (float): minimum sales amount
#         max_amount (float): maximum sales amount

#     Returns:
#         dict: {"customers": [...], "total": int}
#     """
#     import json
#     try:
#         if filters and isinstance(filters, str):
#             filters = json.loads(filters)
#     except Exception:
#         filters = None

#     filters = filters or {}
#     name_like = filters.get('name') or filters.get('customer_name') or ''
#     sales_person = filters.get('sales_person') or ''
#     owner = filters.get('owner') or filters.get('created_by') or filters.get('created_by_user') or filters.get('created_by')
#     territory = filters.get('territory') or ''
#     industry = filters.get('industry') or ''

#     where_clauses = ["c.disabled = 0"]
#     params = {}
#     if name_like:
#         where_clauses.append("c.name LIKE %(name_like)s")
#         params['name_like'] = f"%{name_like}%"
#     if sales_person:
#         where_clauses.append("c.sales_person = %(sales_person)s")
#         params['sales_person'] = sales_person
#     if owner:
#         where_clauses.append("c.owner = %(owner)s")
#         params['owner'] = owner
#     if territory:
#         where_clauses.append("c.territory = %(territory)s")
#         params['territory'] = territory
#     if industry:
#         where_clauses.append("c.industry = %(industry)s")
#         params['industry'] = industry

#     try:
#         page = int(page) if page else 1
#         page_size = int(page_size) if page_size else 20
#     except Exception:
#         page = 1
#         page_size = 20

#     limit_start = (page - 1) * page_size
#     params['min_amount'] = float(min_amount or 0)
#     params['max_amount'] = float(max_amount or 999999999)
#     params['limit_start'] = limit_start
#     params['page_size'] = page_size

#     where_sql = " AND ".join(where_clauses) if where_clauses else '1=1'

#     # Build main query: aggregate sales per customer
#     query = f"""
#         SELECT c.name, c.customer_name, c.territory, c.industry, c.owner, c.sales_person, c.employees,
#                COALESCE(SUM(si.grand_total), 0) AS sales_amount
#         FROM `tabCustomer` c
#         LEFT JOIN `tabSales Invoice` si ON si.customer = c.name AND si.docstatus = 1
#         WHERE {where_sql}
#         GROUP BY c.name
#         HAVING sales_amount >= %(min_amount)s AND sales_amount <= %(max_amount)s
#         ORDER BY sales_amount DESC
#         LIMIT %(limit_start)s, %(page_size)s
#     """

#     # Count query
#     count_query = f"""
#         SELECT COUNT(*) as total FROM (
#             SELECT c.name, COALESCE(SUM(si.grand_total),0) AS sales_amount
#             FROM `tabCustomer` c
#             LEFT JOIN `tabSales Invoice` si ON si.customer = c.name AND si.docstatus = 1
#             WHERE {where_sql}
#             GROUP BY c.name
#             HAVING sales_amount >= %(min_amount)s AND sales_amount <= %(max_amount)s
#         ) t
#     """

#     try:
#         customers = frappe.db.sql(query, params, as_dict=1)
#         total = frappe.db.sql(count_query, params, as_dict=1)
#         total_count = total[0].total if total else 0
#         return {"customers": customers, "total": total_count}
#     except Exception as e:
#         frappe.log_error(frappe.get_traceback(), 'get_customers_with_sales')
#         frappe.throw(str(e))

# renewal_module/api.py
# renewal_module/api.py

# renewal_module/api.py





# renewal_module/api.py

import frappe
from typing import Any, Dict, Optional, List, Tuple
from datetime import date, timedelta


# -----------------------
# Helpers / Sanitizers
# -----------------------

def _normalize_filters(filters) -> Dict[str, Any]:
    """Coerce incoming filters (dict or JSON string) into a safe dict."""
    if isinstance(filters, str):
        try:
            return frappe.parse_json(filters) or {}
        except Exception:
            return {}
    if filters is None:
        return {}
    if isinstance(filters, dict):
        return filters
    try:
        return dict(filters)
    except Exception:
        return {}


def _sanitize_number(value, default: float = 0.0) -> float:
    try:
        if value in (None, "",):
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _sanitize_int(value, default: Optional[int] = None) -> Optional[int]:
    try:
        if value in (None, "",):
            return default
        return int(value)
    except Exception:
        return default


def _sanitize_date(value: Optional[str]) -> Optional[str]:
    """
    Keep as 'YYYY-MM-DD' string if present (HTML date inputs send this format).
    """
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    if not v:
        return None
    return v


def _today() -> date:
    # Frappe stores server date in system TZ; nowdate() -> 'YYYY-MM-DD'
    from frappe.utils import nowdate, getdate
    return getdate(nowdate())


def _add_years(d: date, years: int) -> date:
    """
    Add/subtract whole years from a date, preserving month/day. Handles leap years loosely.
    """
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # Handle Feb 29 to Feb 28 fallback
        if d.month == 2 and d.day == 29:
            return d.replace(month=2, day=28, year=d.year + years)
        # Generic fallback (very rare)
        return d - timedelta(days=1)


def _current_fy_start(today: date, fy_start_month: int, fy_start_day: int) -> date:
    """
    For India FY (default Apr 1), if today >= YYYY-04-01, current FY start is YYYY-04-01,
    else (YYYY-1)-04-01.
    """
    tentative = date(today.year, fy_start_month, fy_start_day)
    if today >= tentative:
        return tentative
    else:
        return date(today.year - 1, fy_start_month, fy_start_day)


def _fy_n_years_ago_bounds(
    n_years_ago: int,
    fy_start_month: int,
    fy_start_day: int,
    ref_today: Optional[date] = None
) -> Tuple[date, date]:
    """
    Return (start_date, end_date) for the FY that is N years ago relative to the current FY.
    Example: if current FY is 2025-04-01..2026-03-31 and n_years_ago=1, return
             2024-04-01 .. 2025-03-31
    """
    ref_today = ref_today or _today()
    curr_fy_start = _current_fy_start(ref_today, fy_start_month, fy_start_day)
    # Target FY start is N years before current FY start
    target_start = _add_years(curr_fy_start, -n_years_ago)
    # The end is one day before the next FY start (which is (N-1) years before current)
    next_start = _add_years(curr_fy_start, -(n_years_ago - 1)) if n_years_ago > 0 else _add_years(curr_fy_start, 1)
    target_end = next_start - timedelta(days=1)
    return target_start, target_end


# -----------------------
# Main API
# -----------------------

# KEY PARTS ONLY — replace inside your existing file

# ... keep the helpers from the previous answer (_normalize_filters, _fy_n_years_ago_bounds, etc.) ...

@frappe.whitelist()
def get_customers_with_sales(
    filters=None,
    page=1,
    page_size=20,
    min_amount=0,
    max_amount=999999999,
    billing_gap_years=None,     # FY = N years ago
    billing_gap_from=None,      # 'YYYY-MM-DD'
    billing_gap_to=None,        # 'YYYY-MM-DD'
    gap_source="invoice",       # "invoice" or "renewal"
    include_never_billed=True,  # not used in FY equality mode
    fy_start_month: int = 4,    # India FY default
    fy_start_day: int = 1
):
    # ---- Normalize inputs (same as before)
    filters = _normalize_filters(filters)

    page = _sanitize_int(page, 1) or 1
    page_size = max(1, _sanitize_int(page_size, 20) or 20)
    offset = (page - 1) * page_size

    min_amount = _sanitize_number(min_amount, 0)
    max_amount = _sanitize_number(max_amount, 999999999)

    billing_gap_years = _sanitize_int(billing_gap_years, None)
    billing_gap_from = _sanitize_date(billing_gap_from)
    billing_gap_to = _sanitize_date(billing_gap_to)
    if billing_gap_from and billing_gap_to and billing_gap_from > billing_gap_to:
        billing_gap_from, billing_gap_to = billing_gap_to, billing_gap_from

    gap_source = (gap_source or "invoice").strip().lower()
    if gap_source not in ("invoice", "renewal"):
        gap_source = "invoice"

    # ---- Determine the period window we will use for the SUM (the “display amount” window)
    params: Dict[str, Any] = {}
    if billing_gap_years is not None:
        # Financial Year window
        start_dt, end_dt = _fy_n_years_ago_bounds(
            n_years_ago=int(billing_gap_years),
            fy_start_month=int(fy_start_month or 4),
            fy_start_day=int(fy_start_day or 1),
            ref_today=_today()
        )
        params["sum_from"] = start_dt.isoformat()
        params["sum_to"] = end_dt.isoformat()
        # Also use this FY for selecting which customers belong to this gap:
        params["fy_start"] = params["sum_from"]
        params["fy_end"] = params["sum_to"]
        # We will filter customers by last_date BETWEEN fy_start and fy_end (same as before)
    elif billing_gap_from or billing_gap_to:
        # Custom date range window (open-ended supported)
        # Define a window for summation as well:
        if billing_gap_from:
            params["sum_from"] = billing_gap_from
        if billing_gap_to:
            params["sum_to"] = billing_gap_to
        # If only one bound provided, use a very wide bound for the missing side
        if "sum_from" not in params:
            params["sum_from"] = "1900-01-01"
        if "sum_to" not in params:
            params["sum_to"] = "2999-12-31"
        # Same window drives which customers are included (by last_date compared against provided from/to)
        # We'll build gap WHERE accordingly below.
    else:
        # No gap filter: we can keep showing lifetime (or you can set it to current FY if you prefer)
        params["sum_from"] = "1900-01-01"
        params["sum_to"] = "2999-12-31"

    # ---- Build Customer WHERE (same as before)
    where_clauses: List[str] = ["c.disabled = 0"]
    if filters.get("name"):
        where_clauses.append("c.name LIKE %(cust_name_like)s")
        params["cust_name_like"] = f"%{filters['name']}%"
    if filters.get("sales_person"):
        where_clauses.append("c.sales_person = %(sales_person)s")
        params["sales_person"] = filters["sales_person"]
    if filters.get("owner"):
        where_clauses.append("c.owner = %(owner)s")
        params["owner"] = filters["owner"]
    if filters.get("territory"):
        where_clauses.append("c.territory = %(territory)s")
        params["territory"] = filters["territory"]
    if filters.get("industry"):
        where_clauses.append("c.industry = %(industry)s")
        params["industry"] = filters["industry"]
    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    # ---- Activity join: compute BOTH last_date (all-time) and period-limited SUM (CHANGE HERE)
    if gap_source == "renewal":
        # Use Renewal List: last activity = MAX(end_date) (all-time)
        # But sum only the amounts that fall within sum_from / sum_to
        activity_join = """
            LEFT JOIN (
                SELECT
                    rl.customer_name AS customer,
                    MAX(rl.end_date) AS last_date,
                    SUM(
                        CASE
                            WHEN rl.end_date BETWEEN %(sum_from)s AND %(sum_to)s
                            THEN COALESCE(rl.total_amount, 0)
                            ELSE 0
                        END
                    ) AS total_amount_period
                FROM `tabRenewal List` rl
                /* Add your own restrictions if needed:
                   WHERE rl.docstatus = 1 AND rl.status = 'Active' */
                GROUP BY rl.customer_name
            ) AS ls ON ls.customer = c.name
        """
    else:
        # Sales Invoice: last activity = MAX(posting_date) (all-time)
        # Sum only invoices in selected window
        activity_join = """
            LEFT JOIN (
                SELECT
                    si.customer,
                    MAX(si.posting_date) AS last_date,
                    SUM(
                        CASE
                            WHEN si.posting_date BETWEEN %(sum_from)s AND %(sum_to)s
                            THEN COALESCE(si.net_total, 0)
                            ELSE 0
                        END
                    ) AS total_amount_period
                FROM `tabSales Invoice` si
                WHERE si.docstatus = 1
                GROUP BY si.customer
            ) AS ls ON ls.customer = c.name
        """

    # ---- Gap WHERE on ls.last_date (FY equality or custom range)
    gap_where = ""
    if billing_gap_years is not None:
        gap_where = " AND ls.last_date BETWEEN %(fy_start)s AND %(fy_end)s "
    elif billing_gap_from or billing_gap_to:
        # Open-ended range support
        if billing_gap_from and billing_gap_to:
            gap_where = " AND ls.last_date BETWEEN %(sum_from)s AND %(sum_to)s "
        elif billing_gap_from:
            gap_where = " AND ls.last_date >= %(sum_from)s "
        elif billing_gap_to:
            gap_where = " AND ls.last_date <= %(sum_to)s "
    # else: no gap filter

    # ---- Core SELECT uses the period-limited total as sales_amount (CHANGE HERE)
    core_select = f"""
        SELECT
            c.name,
            c.customer_name,
            c.territory,
            c.industry,
            c.owner,
            c.sales_person,c.employees,
            COALESCE(ls.total_amount_period, 0) AS sales_amount,  -- period sum
            ls.last_date AS last_activity_date
        FROM `tabCustomer` c
        {activity_join}
        {where_sql}
        {gap_where}
    """

    # ---- HAVING between min/max on the (period) sales_amount
    params.update({
        "min_amount": float(min_amount),
        "max_amount": float(max_amount),
    })
    filtered_select = f"""
        {core_select}
        HAVING sales_amount BETWEEN %(min_amount)s AND %(max_amount)s
    """

    # ---- Count + page (same as before)
    count_sql = f"SELECT COUNT(1) FROM ({filtered_select}) AS X"
    total = frappe.db.sql(count_sql, params)[0][0] if count_sql else 0

    params.update({"offset": int(offset), "page_size": int(page_size)})
    data_sql = f"""
        {filtered_select}
        ORDER BY sales_amount DESC
        LIMIT %(offset)s, %(page_size)s
    """
    rows = frappe.db.sql(data_sql, params, as_dict=True)

    return {
        "customers": rows,
        "total": total
    }

@frappe.whitelist()
def get_products_for_customer(customer_name: str, top_n: int = 8, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """
    Returns top products (by total qty) for a given Customer based on submitted Sales Invoices,
    optionally limited to a date window.
    """
    if not customer_name:
        return []

    try:
        top_n = int(top_n)
    except Exception:
        top_n = 8
    if top_n <= 0:
        top_n = 8

    params = {"customer": customer_name, "limit": int(top_n)}
    date_clause = ""
    if date_from:
        params["date_from"] = date_from
        date_clause += " AND si.posting_date >= %(date_from)s "
    if date_to:
        params["date_to"] = date_to
        date_clause += " AND si.posting_date <= %(date_to)s "

    sql = f"""
        SELECT
            sii.item_code,
            COALESCE(sii.item_name, sii.item_code) AS item_name,
            SUM(COALESCE(sii.qty, 0)) AS total_qty
        FROM `tabSales Invoice` si
        INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
        WHERE si.docstatus = 1
          AND si.customer = %(customer)s
          {date_clause}
        GROUP BY sii.item_code, sii.item_name
        ORDER BY total_qty DESC
        LIMIT %(limit)s
    """

    rows = frappe.db.sql(sql, params, as_dict=True)
    return rows









import frappe

@frappe.whitelist()
def get_custom_count():
    # Example: count Sales Orders with amount > 10,000
    count = frappe.db.count('Sales Order', {
        'grand_total': ['>', 10000]
    })
    return count


# @frappe.whitelist()
# def get_products_for_customer(customer_name, top_n=8):
#     """Return top products (by quantity) for a given customer across submitted Sales Invoices.

#     This uses SQL aggregation for performance and to avoid multiple client-side calls.
#     """
#     if not customer_name:
#         return []

#     try:
#         top_n = int(top_n) if top_n else 8
#     except Exception:
#         top_n = 8

#     query = """
#         SELECT
#             sii.item_name as item_name,
#             sii.item_code as item_code,
#             SUM(COALESCE(sii.qty, 0)) as total_qty,
#             SUM(COALESCE(sii.amount, 0)) as total_amount
#         FROM `tabSales Invoice Item` sii
#         JOIN `tabSales Invoice` si ON si.name = sii.parent AND si.docstatus = 1
#         WHERE si.customer = %s
#         GROUP BY sii.item_code, sii.item_name
#         ORDER BY total_qty DESC
#         LIMIT %s
#     """

#     try:
#         rows = frappe.db.sql(query, (customer_name, top_n), as_dict=1)
#         return rows
#     except Exception as e:
#         frappe.log_error(frappe.get_traceback(), 'get_products_for_customer')
#         return []


#option in working agent in issue
@frappe.whitelist()

def get_support_users():
    roles = ["Support", "Tech Support"]
    users = frappe.db.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name", "full_name"],
        order_by="full_name"
    )

    filtered_users = []
    for user in users:
        user_roles = frappe.get_roles(user.name)
        if any(role in roles for role in user_roles):
            filtered_users.append({
                "email": user.name,
                "full_name": user.full_name
            })
	
    return filtered_users




@frappe.whitelist()
def get_item_data(customer):
    # items = frappe.db.get_all(
    #     "Sales Invoice Item",
    #     filters={"parent": parent},
    #     fields=["item_code", "item_name"],
    #     order_by="parent"
    # )
    items = frappe.db.sql(f"""
                    SELECT `tabSales Invoice Item`.item_code, `tabSales Invoice Item`.item_name FROM `tabSales Invoice Item`
                    LEFT JOIN `tabSales Invoice` on    `tabSales Invoice`.name = `tabSales Invoice Item`.parent   
                     WHERE `tabSales Invoice`.customer= '{customer}'   
                      Group By `tabSales Invoice Item`.item_code """,as_dict=1)
    return items



#email notification on issue creation
# This function sends an email notification to the primary contact of a customer when a new issue is created.
# It retrieves the primary contact's email from the linked contacts of the customer and sends an email with the issue details.

# import frappe
# from frappe.utils import now_datetime, format_datetime

# def send_issue_email(doc, method):
#     print("Function called")

#     if not doc.issue_contact_list:
#         print("No entries in Issue Contact List")
#         return

#     # Gather all email IDs from the child table
#     email_list = []
#     for row in doc.issue_contact_list:
#         if row.email_id:
#             email_list.append(row.email_id)
#             print(f"Found email: {row.email_id}")
#     email_list.append(doc.sales_person)  # Add salesperson email if available
#     if not email_list:
#         print("No valid email IDs found in Issue Contact List")
#         return

#     # Format times
#     current_time = now_datetime()
#     response_time = doc.response_by
#     resolution_time = doc.sla_resolution_by

#     def fmt(dt):
#         return format_datetime(dt, "dd-MM-yyyy hh:mm a") if dt else "N/A"

#     # Message body
#     # message = f"""
#     # Dear Customer,<br><br>

#     # Thank you for reaching out. We have received your support ticket.<br><br>

#     # <b>Ticket ID:</b> {doc.name}<br>
#     # <b>Subject:</b> {doc.subject}<br>
#     # <b>Description:</b><br>{doc.description}<br><br>

#     # Our support team received your ticket at <b>{fmt(current_time)}</b><br>
#     # and will respond by <b>{fmt(response_time)}</b>.<br><br>

#     # Resolution is expected by <b>{fmt(resolution_time)}</b>.<br><br>

#     # Regards,<br>
#     # Support Team
#     # """

#     message = f"""
#         <html>
#         <head>
#         <style>
#             body {{
#             font-family: Arial, sans-serif;
#             color: #333;
#             font-size: 14px;
#             line-height: 1.6;
#             }}
#             .email-container {{
#             border: 1px solid #e0e0e0;
#             padding: 20px;
#             border-radius: 6px;
#             background-color: #f9f9f9;
#             max-width: 600px;
#             }}
#             .header {{
#             font-size: 16px;
#             font-weight: bold;
#             margin-bottom: 15px;
#             }}
#             .label {{
#             font-weight: bold;
#             }}
#             .footer {{
#             margin-top: 20px;
#             font-size: 13px;
#             color: #777;
#             }}
#         </style>
#         </head>
#         <body>
#         <div class="email-container">
#             <div class="header">Support Ticket Acknowledgement</div>

#             <p>Dear Customer,</p>

#             <p>Thank you for reaching out. We have received your support ticket.</p>

#             <p>
#             <span class="label">Ticket ID:</span> {doc.name}<br>
#             <span class="label">Subject:</span> {doc.subject}<br>
#             <span class="label">Description:</span><br>
#             {doc.description}
#             </p>

#             <p>
#             Our support team received your ticket at <b>{fmt(current_time)}</b><br>
#             and will respond by <b>{fmt(response_time)}</b>.<br><br>
#             Resolution is expected by <b>{fmt(resolution_time)}</b>.
            
#             </p>

#             <div class="footer">
#             Regards,<br>
#             Support Team
#             </div>
#         </div>
#         </body>
#         </html>
#     """
    
#     try:
#         frappe.sendmail(
#             recipients=email_list,
#             subject=f"New Issue Created - {doc.name}",
#             message=message,
#             reference_doctype=doc.doctype,
#             reference_name=doc.name
#         )
#         print(f"Email sent to: {', '.join(email_list)}")
#     except Exception as e:
#         print(f"Error sending email: {e}")


# merge customers for duplicate customer

import frappe
from frappe import _
from frappe.model.rename_doc import rename_doc
import json

@frappe.whitelist()
def merge_customers(main_customer, duplicate_customers):
    skipped = []

    try:
        # Ensure list format
        if isinstance(duplicate_customers, str):
            duplicate_customers = json.loads(duplicate_customers)

        for dup in duplicate_customers:
            dup = dup.strip()
            if not dup or dup == main_customer or dup in ("[", "]", ",", "<br>"):
                skipped.append(dup)
                continue

            if not frappe.db.exists("Customer", dup):
                skipped.append(dup)
                continue

            rename_doc("Customer", dup, main_customer, merge=True, force=True)

        return {
            "status": "ok",
            "skipped": skipped
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Merge Error")
        return {
            "status": "error",
            "message": str(e)
        }



@frappe.whitelist()
def get_opportunity_items(doctype, txt, searchfield, start, page_len, filters):
    # frappe.msgprint("hello")
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters)))
    opportunity = filters.get("opportunity") if filters else None
    # if opportunity:
    #     frappe.msgprint(opportunity)
    # else:
    #     frappe.msgprint("no opp")    
    return frappe.db.sql("""
        SELECT
            `tabOpportunity Item`.name,`tabOpportunity Item`.parent,
                         `tabOpportunity`.party_name,
            `tabOpportunity Item`.item_code,`tabOpportunity Item`.item_name,
            `tabOpportunity Item`.qty,`tabOpportunity Item`.rate,
            `tabOpportunity Item`.amount,`tabOpportunity Item`.opportunity_type
        FROM `tabOpportunity Item`
        inner join `tabOpportunity` on `tabOpportunity Item`.parent = `tabOpportunity`.name
        WHERE
             (`tabOpportunity Item`.name LIKE %(txt)s OR `tabOpportunity Item`.item_code LIKE %(txt)s OR `tabOpportunity Item`.parent LIKE %(txt)s)
        order by `tabOpportunity Item`.parent Desc
                         LIMIT 20
    """, {
        "opportunity": opportunity,
        "txt": f"%{txt}%"
    })


import frappe
from frappe.utils import now_datetime, format_datetime

def send_issue_email(doc, method):
    print("Function called")

    if not doc.issue_contact_list:
        print("No entries in Issue Contact List")
        return

    # Gather all email IDs from the child table
    email_list = []
    for row in doc.issue_contact_list:
        if row.email_id:
            email_list.append(row.email_id)
            print(f"Found email: {row.email_id}")
            
    email_list.append(doc.sales_person)
    if not email_list:
        print("No valid email IDs found in Issue Contact List")
        return

    # Format times
    current_time = now_datetime()
    response_time = doc.response_by
    resolution_time = doc.sla_resolution_by

    def fmt(dt):
        return format_datetime(dt, "dd-MM-yyyy hh:mm a") if dt else "N/A"

    # Message body
    # message = f"""
    # Dear Customer,<br><br>

    # Thank you for reaching out. We have received your support ticket.<br><br>

    # <b>Ticket ID:</b> {doc.name}<br>
    # <b>Subject:</b> {doc.subject}<br>
    # <b>Description:</b><br>{doc.description}<br><br>

    # Our support team received your ticket at <b>{fmt(current_time)}</b><br>
    # and will respond by <b>{fmt(response_time)}</b>.<br><br>

    # Resolution is expected by <b>{fmt(resolution_time)}</b>.<br><br>

    # Regards,<br>
    # Support Team
    # """

    message = f"""
        <html>
        <head>
        <style>
            body {{
            font-family: Arial, sans-serif;
            color: #333;
            font-size: 14px;
            line-height: 1.6;
            }}
            .email-container {{
            border: 1px solid #e0e0e0;
            padding: 20px;
            border-radius: 6px;
            background-color: #f9f9f9;
            max-width: 600px;
            }}
            .header {{
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            }}
            .label {{
            font-weight: bold;
            }}
            .footer {{
            margin-top: 20px;
            font-size: 13px;
            color: #777;
            }}
        </style>
        </head>
        <body>
        <div class="email-container">
            <div class="header">Support Ticket Acknowledgement</div>

            <p>Dear Customer,</p>

            <p>Thank you for reaching out. We have received your support ticket.</p>

            <p>
            <span class="label">Ticket ID:</span> {doc.name}<br>
            <span class="label">Subject:</span> {doc.subject}<br>
            <span class="label">Description:</span><br>
            {doc.description}
            </p>

            <p>
            Our support team received your ticket at <b>{fmt(current_time)}</b><br>
            and will respond by <b>{fmt(response_time)}</b>.<br><br>
            Resolution is expected by <b>{fmt(resolution_time)}</b>.
            </p>

            <div class="footer">
            Regards,<br>
            Support Team
            </div>
        </div>
        </body>
        </html>
    """

    try:
        frappe.sendmail(
            recipients=email_list,
            subject=f"New Issue Created - {doc.name}",
            message=message,
            reference_doctype=doc.doctype,
            reference_name=doc.name
        )
        print(f"Email sent to: {', '.join(email_list)}")
    except Exception as e:
        print(f"Error sending email: {e}")


import frappe
from frappe.utils import now_datetime, format_datetime

def send_issue_email_on_agent_change(doc, method):
    print("Function called")

    # Check if 'working_agent' field has changed
    previous = doc.get_doc_before_save()
    if not previous:
        print("No previous version of doc (probably a new doc)")
        return
    
    if previous.working_agent == doc.working_agent:
        print("Working Agent has not changed.")
        return

    # Email to new working agent only
    if not doc.working_agent:
        print("No working agent specified.")
        return

    working_agent_email = doc.working_agent

    # Format times
    current_time = now_datetime()
    response_time = doc.response_by
    resolution_time = doc.sla_resolution_by
    creation_time = doc.creation

    def fmt(dt):
        return format_datetime(dt, "dd-MM-yyyy hh:mm a") if dt else "N/A"

    # Email HTML body
    message = f"""
        <html>
        <head>
        <style>
            body {{
            font-family: Arial, sans-serif;
            color: #333;
            font-size: 14px;
            line-height: 1.6;
            }}
            .email-container {{
            border: 1px solid #e0e0e0;
            padding: 20px;
            border-radius: 6px;
            background-color: #f9f9f9;
            max-width: 600px;
            }}
            .header {{
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            }}
            .label {{
            font-weight: bold;
            }}
            .footer {{
            margin-top: 20px;
            font-size: 13px;
            color: #777;
            }}
        </style>
        </head>
        <body>
        <div class="email-container">
            <div class="header">New Issue Assigned to You</div>

            <p>Dear Agent,</p>

            <p>A new support issue has been assigned to you.</p>

            <p>
            <span class="label">Ticket ID:</span> {doc.name}<br>
            <span class="label">Subject:</span> {doc.subject}<br>
            </p>

            <p>
            The ticket was created at <b>{fmt(creation_time)}</b><br>
            Response expected by <b>{fmt(response_time)}</b><br>
            Resolution expected by <b>{fmt(resolution_time)}</b>
            </p>

            <div class="footer">
            Regards,<br>
            Support System
            </div>
        </div>
        </body>
        </html>
    """

    try:
        frappe.sendmail(
            recipients=[working_agent_email],
            subject=f"Issue Assigned: {doc.name}",
            message=message,
            reference_doctype=doc.doctype,
            reference_name=doc.name
        )
        print(f"Email sent to working agent: {working_agent_email}")
    except Exception as e:
        print(f"Error sending email: {e}")




import frappe
from frappe.utils import now

def test_cron_job():
    """
    This will create a new document every time the cron runs.
    """
    try:
        frappe.logger().info("Reminder cron running...")
        frappe.get_doc({
            "doctype": "Cron Test Log",
            "message": f"Cron ran at {now()}"
        }).insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Error in test_cron_job: {e}", "Cron Test Error")
    print("Cron job executed and log created.")

import frappe
from frappe.utils.data import now

def create_test_cron():
    if not frappe.db.exists("Scheduled Job Type", "Test Cron Job"):
        frappe.get_doc({
            "doctype": "Scheduled Job Type",
            "method": "renewal_module.appointment_notifications.check_and_send_reminders",
            "frequency": "Cron",
            "cron_format": "* * * * *",
            "enabled": 1
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        print("Scheduled Job Type created")
    else:
        print("Scheduled Job Type already exists")


### support page template methods start
@frappe.whitelist()
def get_support_page():
    """Return the rendered support page HTML."""
    html = frappe.render_template("renewal_module/templates/includes/support_page.html", {})
    return {"ok": True, "rendered_html": html}

@frappe.whitelist()
def get_support_theme_page():
    """Return the rendered support page HTML."""
    html = frappe.render_template("renewal_module/templates/includes/support_theme.html", {})
    return {"ok": True, "rendered_html": html}

@frappe.whitelist()
def global_search(txt, limit=5):
    # frappe.msgprint("Hi")
    results = []
    doctypes = frappe.get_all("DocType", filters={
        "istable": 0,
        "issingle": 0,
        "name": ["like", f"%{txt}%"]
    }, fields=["name"],limit_page_length=limit)
    for dt in doctypes:
        results.append({"doctype": dt.name})
        # try:
        #     items = frappe.get_all(dt.name, filters=[["name", "like", f"%{txt}%"]], fields=["name"], limit_page_length=limit)
        #     for item in items:
        #         results.append({"doctype": dt.name})
        # except Exception:
        #     continue
    return results


@frappe.whitelist()
def get_user_notifications(offset=0, limit=10):
    user = frappe.session.user
    notifications = frappe.get_all(
        "Notification Log",
        filters={"for_user": user},
        fields=["name", "subject", "email_content", "creation", "read"],
        order_by="creation desc",
        limit_start=int(offset),
        limit_page_length=int(limit)
    )
    return notifications



import frappe

@frappe.whitelist()
def mark_all_as_read():
    user = frappe.session.user
    frappe.db.sql("""
        UPDATE `tabNotification Log`
        SET `read` = 1
        WHERE for_user = %s AND coalesce(`read`, 0) = 0
    """, (frappe.session.user,))
    frappe.db.commit()

    return True

@frappe.whitelist()
def mark_notification_as_read(notification_name):
    if notification_name:
        frappe.db.set_value("Notification Log", notification_name, "read", 1)
        frappe.db.commit()
    return {"status": "success"}



###ended support page tempalte

### when the custom page to after login to show ##
import frappe

def redirect_after_login():
    """Redirect after login based on user roles — works reliably on Desk."""
    
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # Debug Log
    frappe.logger().info(f"[redirect_after_login] user={user} roles={roles}")

    # List of roles allowed to redirect
    tech_support_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    # If user has any of these roles → redirect
    if any(role in roles for role in tech_support_roles):
        frappe.local.response["home_page"] = "/app/support-dashboard-te-1"




import frappe
@frappe.whitelist()
def get_salespersons_for_user():
    user = frappe.session.user
    user_roles = frappe.get_roles()

    if user == "Administrator" or "System Manager" in user_roles:
        sales_persons = frappe.get_all("Sales Person", fields=["name", "parent_sales_person"],filters={"enabled": 1})
    else:
        employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if not employee:
            return []
        sales_person_doc = frappe.get_all(
            "Sales Person",
            filters={"employee": employee},
            fields=["name", "is_group", "parent_sales_person"]
        )
        if not sales_person_doc:
            return []
        sales_person = sales_person_doc[0]
        result = [sales_person]
        if sales_person["is_group"]:
            child_salespersons = frappe.get_all(
                "Sales Person",
                filters={"parent_sales_person": sales_person["name"]},
                fields=["name", "parent_sales_person"]
            )
            result.extend(child_salespersons)
        return result

    return sales_persons



import frappe
import json
from frappe import _

@frappe.whitelist()
def bulk_assign_customer_to_salesperson_by_user(customers, user_email):
    if isinstance(customers, str):
        customers = json.loads(customers)

    if not frappe.db.exists("User", user_email):
        frappe.throw(f"User {user_email} does not exist.")

    for customer in customers:
        if not frappe.db.exists("Customer", customer):
            frappe.msgprint(f"Customer {customer} does not exist, skipping.")
            continue

        # ✅ Update 'account_manager' field on Customer
        try:
            frappe.db.set_value("Customer", customer, "account_manager", user_email)
        except Exception as e:
            frappe.log_error(f"Failed to update account_manager for {customer}", str(e))
        # ✅ Debugging block to trace Sales Team update issue
        try:
            # Step 1: Find Employee linked to user
            employee = frappe.db.get_value("Employee", {"user_id": user_email},["name", "cell_number"])
            if not employee:
                frappe.log_error("Sales Team Debug", f"No Employee linked to user: {user_email}")
                continue
            employee_name, mobile_no = employee
            # Step 2: Find Sales Person linked to employee
            sales_person_data = frappe.db.get_value("Sales Person", {"employee": employee_name},["name","parent_sales_person"])
            if not sales_person_data:
                frappe.log_error("Sales Team Debug", f"No Sales Person linked to Employee {employee}")
                continue
            sales_person, team_name = sales_person_data
            # Step 3: Load and modify Customer doc
            customer_doc = frappe.get_doc("Customer", customer)
            #frappe.log_error("Sales Team Debug", f"Loaded Customer Doc {customer}")
            # Step 4: Clear and update sales_team
            customer_doc.sales_team = []
            customer_doc.append("sales_team", {
                "sales_person": sales_person,
                "allocated_percentage": 100,
                "team_name":team_name,
                "mobile_no":mobile_no or '',
                "email_id":user_email
            })
            # Step 5: Save changes
            customer_doc.flags.ignore_mandatory = True
            customer_doc.save(ignore_permissions=True)
            frappe.db.commit()
            #frappe.log_error("Sales Team Debug", f"Customer {customer} saved successfully")
        except Exception as e:
            frappe.log_error("Sales Team Update Error", f"Customer: {customer} | Error: {str(e)}")

        # Share the Customer
        try:
            frappe.share.add("Customer", customer, user_email, read=1)
        except Exception as e:
            frappe.log_error(f"Failed to share Customer {customer}: {str(e)}")

        # Share linked Contacts (via Dynamic Link)
        contact_names = frappe.db.sql("""
            SELECT DISTINCT dl.parent AS name
            FROM `tabDynamic Link` dl
            JOIN `tabContact` c ON c.name = dl.parent
            WHERE dl.link_doctype = 'Customer' AND dl.link_name = %s
        """, (customer,), as_dict=True)

        for cont in contact_names:
            try:
                frappe.share.add("Contact", cont.name, user_email, read=1)
            except Exception as e:
                frappe.log_error(f"Failed to share Contact {cont.name}: {str(e)}")

        # Share linked Addresses (via Dynamic Link)
        address_names = frappe.db.sql("""
            SELECT DISTINCT dl.parent AS name
            FROM `tabDynamic Link` dl
            JOIN `tabAddress` a ON a.name = dl.parent
            WHERE dl.link_doctype = 'Customer' AND dl.link_name = %s
        """, (customer,), as_dict=True)

        for addr in address_names:
            try:
                frappe.share.add("Address", addr.name, user_email, read=1)
            except Exception as e:
                frappe.log_error(f"Failed to share Address {addr.name}: {str(e)}")

        # Share Opportunities
        opportunity_names = frappe.get_all("Opportunity", filters={"party_name": customer}, pluck="name")
        for opp in opportunity_names:
            try:
                frappe.share.add("Opportunity", opp, user_email, read=1)
            except Exception as e:
                frappe.log_error(f"Failed to share Opportunity {opp}: {str(e)}")
                
        # Share Quotations
        quotations = frappe.get_all("Quotation", filters={"party_name": customer}, pluck="name")
        for quo in quotations:
            try:
                frappe.share.add("Quotation", quo, user_email, read=1)
            except Exception as e:
                frappe.log_error(f"Failed to share Quotation {quo}: {str(e)}")

        # Share Customer Order Forms (COFs)
        cofs = frappe.get_all("Customer Order Form", filters={"customer": customer}, pluck="name")
        for cof in cofs:
            try:
                frappe.share.add("Customer Order Form", cof, user_email, read=1)
            except Exception as e:
                frappe.log_error(f"Failed to share Customer Order Form {cof}: {str(e)}")

        # Share Renewal Lists
        renewals = frappe.get_all("Renewal List", filters={"customer_name": customer}, pluck="name")
        for renewal in renewals:
            try:
                frappe.share.add("Renewal List", renewal, user_email, read=1)
            except Exception as e:
                frappe.log_error(f"Failed to share Renewal List {renewal}: {str(e)}")

    frappe.db.commit()
    return "ok"









# renewal_module/api.py
import frappe

@frappe.whitelist()
def get_tickets(limit_start=0, limit_page_length=50):
    tickets = frappe.get_all(
        "Issue",  # or your custom Ticket DocType
        fields=[
            "name", "raised_by", "subject", "assigned_to", 
            "priority", "status", "creation", "expected_resolution_date"
        ],
        order_by="creation desc",
        limit_start=limit_start,
        limit_page_length=limit_page_length
    )
    total = frappe.db.count("Issue")  # total tickets for pagination
    return {"tickets": tickets, "total": total}
