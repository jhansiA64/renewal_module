# Copyright (c) 2026, 64 Network Security Pvt. Ltd.
# Opportunity Reports — backbone for the custom `opp-reports` desk page.
#
# Place at: <your_app>/<your_app>/api/opp_reports.py
# Then point the JS API constant at "<your_app>.api.opp_reports".
#
# Every report returns the SAME shape so one renderer draws all of them:
#     { "summary": [card...], "chart": {...}|None, "columns": [col...], "rows": [row...] }

import frappe
from frappe import _
from frappe.utils import flt, cint, getdate, nowdate, date_diff

# ---------------------------------------------------------------------------
# CONFIG — confirm against your Opportunity doctype.
#   frappe.get_meta("Opportunity").fields.map(f => f.fieldname)
# Field-dependent reports degrade gracefully if a column is absent.
# ---------------------------------------------------------------------------
SALES_PERSON_FIELD = "owner"              # who the opportunity belongs to
AMOUNT_FIELD       = "opportunity_amount"
DATE_FIELD         = "transaction_date"   # used by the From/To filter + aging
SOURCE_FIELD       = "source"
TERRITORY_FIELD    = "territory"
CONTACT_DATE_FIELD = "contact_date"       # next/last follow-up date
FORECAST_FIELD     = "custom_forecast"     # select field; values: '' / 'Include' / 'Exclude'
ORG_ROLES          = ("Sales Manager", "System Manager")

# --- Opportunity Item fields for the line-item table (confirm custom names) ---
#   frappe.get_meta("Opportunity Item").fields.map(f => f.fieldname)
# Missing columns are detected and shown blank rather than erroring.
ITEM_BUYING_RATE   = "custom_buying_rate"
ITEM_BUYING_AMOUNT = "custom_buying_amount"
ITEM_ORC           = "custom_orc"
ITEM_MARGIN        = "custom_margin"        # if absent, computed as amount - buying_amount

WON_STATUSES  = ("Converted",)
LOST_STATUSES = ("Lost",)
OPEN_STATUSES = ("Open", "Quotation", "Replied")
ALL_STATUSES  = ("Open", "Quotation", "Replied", "Converted", "Lost", "Closed")

CATALOGUE = [
    {"key": "pipeline_overview",    "label": "Pipeline overview",      "category": "Pipeline & forecast", "icon": "ti-chart-bar"},
    {"key": "stage_funnel",         "label": "Sales-stage funnel",     "category": "Pipeline & forecast", "icon": "ti-filter"},
    {"key": "forecast",             "label": "Forecast by closing",    "category": "Pipeline & forecast", "icon": "ti-calendar"},
    {"key": "aging",                "label": "Aging & stuck deals",    "category": "Pipeline & forecast", "icon": "ti-clock"},
    {"key": "leaderboard",          "label": "Sales-person leaderboard","category": "Performance",        "icon": "ti-trophy"},
    {"key": "win_loss",             "label": "Win / loss analysis",    "category": "Performance",         "icon": "ti-scale"},
    {"key": "conversion_trend",     "label": "Conversion trend",       "category": "Performance",         "icon": "ti-trending-up"},
    {"key": "source_effectiveness", "label": "Source effectiveness",   "category": "Segmentation",        "icon": "ti-route"},
    {"key": "territory_performance","label": "Territory performance",  "category": "Segmentation",        "icon": "ti-map-pin"},
    {"key": "top_accounts",         "label": "Top accounts",           "category": "Segmentation",        "icon": "ti-building"},
    {"key": "follow_up",            "label": "Follow-up / next action","category": "Activity",            "icon": "ti-bell"},
]

INDICATORS = {"blue": "blue", "green": "green", "orange": "orange", "red": "red", "yellow": "yellow", "gray": "gray"}


# ===========================================================================
# Public endpoints
# ===========================================================================
@frappe.whitelist()
def get_meta():
    """Catalogue + the scopes this user is allowed to choose."""
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    allowed = ["My"]
    if _employee_for_user(user):
        allowed.append("My Team")
    if roles & set(ORG_ROLES):
        allowed.append("Organization")
    stages = frappe.get_all("Sales Stage", pluck="name", order_by="name") \
        if frappe.db.exists("DocType", "Sales Stage") else []
    return {
        "catalogue": CATALOGUE,
        "scopes": allowed,
        "statuses": list(ALL_STATUSES),
        "sales_stages": stages,
        "forecast_field": _has(FORECAST_FIELD),
    }


@frappe.whitelist()
def search_options(kind, txt=""):
    """Type-to-search source for the toolbar multiselects.
    Returns [{value, label, description}] — label kept short so the
    MultiSelectList rows stay clean."""
    txt = (txt or "").strip()
    like = f"%{txt}%"

    if kind == "sales_person":
        rows = frappe.db.sql("""
            select name value, coalesce(nullif(full_name,''), name) label, name description
            from `tabUser`
            where enabled=1 and name not in ('Administrator','Guest')
              and (name like %(l)s or full_name like %(l)s)
            order by full_name limit 20""", {"l": like}, as_dict=True)
    elif kind == "party_name":
        rows = frappe.db.sql("""
            select name value, name label, '' description from `tabCustomer`
            where name like %(l)s or customer_name like %(l)s
            order by name limit 20""", {"l": like}, as_dict=True)
    elif kind == "company":
        rows = frappe.db.sql("""
            select name value, name label, '' description from `tabCompany`
            where name like %(l)s order by name limit 20""", {"l": like}, as_dict=True)
    elif kind == "brand":
        rows = frappe.db.sql("""
            select name value, name label, '' description from `tabBrand`
            where name like %(l)s order by name limit 20""", {"l": like}, as_dict=True)
    else:
        rows = []

    for r in rows:
        if r.get("label"):
            r["label"] = (r["label"][:60] + "…") if len(r["label"]) > 60 else r["label"]
        if r.get("description"):
            r["description"] = (r["description"][:60] + "…") if len(r["description"]) > 60 else r["description"]
    return rows


@frappe.whitelist()
def get_report(report, scope="My", filters=None):
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    filters = frappe._dict(filters)
    filters["scope"] = scope

    dispatch = {
        "pipeline_overview": _pipeline_overview,
        "stage_funnel": _stage_funnel,
        "forecast": _forecast,
        "aging": _aging,
        "leaderboard": _leaderboard,
        "win_loss": _win_loss,
        "conversion_trend": _conversion_trend,
        "source_effectiveness": _source_effectiveness,
        "territory_performance": _territory_performance,
        "top_accounts": _top_accounts,
        "follow_up": _follow_up,
    }
    fn = dispatch.get(report)
    if not fn:
        frappe.throw(_("Unknown report: {0}").format(report))

    scope_users = _resolve_scope(filters)
    return fn(filters, scope_users)


# ===========================================================================
# Scope resolution
# ===========================================================================
def _resolve_scope(filters):
    user = frappe.session.user
    requested = filters.get("scope") or "My"
    roles = set(frappe.get_roles(user))

    if requested == "Organization":
        if not (roles & set(ORG_ROLES)):
            frappe.throw(_("You are not permitted to view the Organization scope."))
        return None
    if requested == "My Team":
        emp = _employee_for_user(user)
        if not emp:
            frappe.throw(_("No Employee record is linked to your user."))
        return _team_user_ids(emp)
    return [user]


def _employee_for_user(user):
    return frappe.db.get_value("Employee", {"user_id": user}, ["name", "lft", "rgt"], as_dict=True)


def _team_user_ids(emp):
    rows = frappe.db.sql(
        """select user_id from `tabEmployee`
           where lft >= %(lft)s and rgt <= %(rgt)s
             and user_id is not null and user_id != ''""",
        {"lft": emp.lft, "rgt": emp.rgt}, as_dict=True,
    )
    users = [r.user_id for r in rows]
    if frappe.session.user not in users:
        users.append(frappe.session.user)
    return users


# ===========================================================================
# Shared helpers
# ===========================================================================
def _has(col):
    return frappe.db.has_column("Opportunity", col)


def _has_item(col):
    return frappe.db.has_column("Opportunity Item", col)


def _as_list(v):
    """Normalise an incoming multiselect value to a clean list."""
    if v is None or v == "":
        return []
    if isinstance(v, str):
        v = [v]
    return [x for x in v if x not in (None, "")]


def _in_clause(cond, p, column, key, values):
    """Append a `column in (...)` clause with a uniquely-named param."""
    if not values:
        return
    cond.append(f"{column} in %({key})s")
    p[key] = tuple(values)


def _base(filters, scope_users, date_field=None):
    # The timespan/custom range always targets expected_closing; the optional
    # date_field arg (e.g. aging on transaction_date) is kept for callers that
    # pass it, but the user-facing range uses expected_closing.
    cond, p = ["1=1"], {}

    # --- multiselect IN filters ---
    _in_clause(cond, p, "o.company", "f_company", _as_list(filters.get("company")))
    _in_clause(cond, p, "o.sales_stage", "f_stage", _as_list(filters.get("sales_stage")))
    _in_clause(cond, p, "o.party_name", "f_party", _as_list(filters.get("party_name")))
    _in_clause(cond, p, f"o.`{SALES_PERSON_FIELD}`", "f_sp", _as_list(filters.get("sales_person")))

    # --- status (still single) ---
    if filters.get("status"):
        cond.append("o.status=%(status)s"); p["status"] = filters["status"]

    # --- brand: lives on the items child table ---
    brands = _as_list(filters.get("brand"))
    if brands:
        cond.append("exists (select 1 from `tabOpportunity Item` oi "
                    "where oi.parent = o.name and oi.brand in %(f_brand)s)")
        p["f_brand"] = tuple(brands)

    # --- forecast: '' = both, 'Include' = only, 'Exclude' = not ---
    fc = (filters.get("forecast") or "").strip()
    if fc == "Include":
        cond.append(f"o.`{FORECAST_FIELD}` = 'Include'")
    elif fc == "Exclude":
        cond.append(f"o.`{FORECAST_FIELD}` = 'Exclude'")

    # --- timespan / custom range on expected_closing ---
    frm, to = _resolve_timespan(filters)
    if frm:
        cond.append("o.expected_closing >= %(ec_from)s"); p["ec_from"] = frm
    if to:
        cond.append("o.expected_closing <= %(ec_to)s"); p["ec_to"] = to

    # --- scope cap (ANDs with any explicit sales_person picks) ---
    if scope_users is not None:
        if not scope_users:
            cond.append("1=0")
        else:
            cond.append(f"o.`{SALES_PERSON_FIELD}` in %(su)s"); p["su"] = tuple(scope_users)

    return " and ".join(cond), p


def _resolve_timespan(filters):
    """Return (from_date, to_date) for the expected_closing filter.
    Custom mode uses from_date/to_date directly; otherwise resolve a preset
    like 'this_month' / 'last_quarter' / 'next_year' / 'this_week'."""
    from frappe.utils import (get_first_day, get_last_day, get_first_day_of_week,
                              get_last_day_of_week, get_quarter_start, get_quarter_ending,
                              get_year_start, get_year_ending, add_to_date, getdate, nowdate)

    span = (filters.get("timespan") or "").strip()
    if not span or span == "custom":
        return filters.get("from_date") or None, filters.get("to_date") or None

    today = getdate(nowdate())
    try:
        rel, unit = span.split("_", 1)   # e.g. "this_month"
    except ValueError:
        return None, None

    if unit == "week":
        base = today if rel == "this" else add_to_date(today, days=(-7 if rel == "last" else 7))
        return get_first_day_of_week(base), get_last_day_of_week(base)
    if unit == "month":
        base = today if rel == "this" else add_to_date(today, months=(-1 if rel == "last" else 1))
        return get_first_day(base), get_last_day(base)
    if unit == "quarter":
        base = today if rel == "this" else add_to_date(today, months=(-3 if rel == "last" else 3))
        return get_quarter_start(base), get_quarter_ending(base)
    if unit == "year":
        base = today if rel == "this" else add_to_date(today, years=(-1 if rel == "last" else 1))
        return get_year_start(base), get_year_ending(base)
    return None, None


def _card(label, value, datatype="Data", indicator="gray"):
    return {"label": _(label), "value": value, "datatype": datatype, "indicator": indicator}


def _col(label, fieldname, fieldtype="Data", width=120, align=None, options=None):
    c = {"label": _(label), "fieldname": fieldname, "fieldtype": fieldtype, "width": width}
    if align:
        c["align"] = align
    if options:
        c["options"] = options
    return c


def _win_rate(won, lost):
    decided = won + lost
    return round(won / decided * 100.0, 1) if decided else 0.0


def _empty(message):
    return {"summary": [_card("Notice", message)], "chart": None, "columns": [], "rows": []}


# ===========================================================================
# 1. Pipeline overview
# ===========================================================================
def _pipeline_overview(filters, scope_users):
    where, p = _base(filters, scope_users)

    # --- summary + chart stay at OPPORTUNITY level (correct counts/values) ---
    heads = frappe.db.sql(f"""
        select o.name, o.status status, o.`{SALES_PERSON_FIELD}` sales_person,
               o.`{AMOUNT_FIELD}` amount, o.probability probability,
               (o.`{AMOUNT_FIELD}`*o.probability/100.0) weighted
        from `tabOpportunity` o where {where}""", p, as_dict=True)

    open_v = sum(flt(r.amount) for r in heads if r.status in OPEN_STATUSES)
    wtd    = sum(flt(r.weighted) for r in heads if r.status in OPEN_STATUSES)
    won_v  = sum(flt(r.amount) for r in heads if r.status in WON_STATUSES)
    won    = sum(1 for r in heads if r.status in WON_STATUSES)
    lost   = sum(1 for r in heads if r.status in LOST_STATUSES)

    summary = [
        _card("Total opportunities", len(heads), "Int", "blue"),
        _card("Open pipeline", open_v, "Currency", "orange"),
        _card("Weighted pipeline", wtd, "Currency", "yellow"),
        _card("Won value", won_v, "Currency", "green"),
        _card("Win rate", _win_rate(won, lost), "Percent", "green"),
    ]

    if (filters.get("scope") or "My") == "My":
        buckets = {}
        for r in heads:
            buckets[r.status] = buckets.get(r.status, 0) + flt(r.amount)
        chart = _bar("Amount by status", list(buckets.keys()), list(buckets.values()))
    else:
        buckets = {}
        for r in heads:
            k = r.sales_person or _("Unassigned")
            buckets[k] = buckets.get(k, 0) + flt(r.amount)
        items = sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)[:10]
        chart = _bar("Amount by sales person", [k for k, _v in items], [v for _k, v in items])

    # --- table at ITEM level ---
    # build the optional cost columns only if the field exists on Opportunity Item
    buy_rate = f"oi.`{ITEM_BUYING_RATE}`" if _has_item(ITEM_BUYING_RATE) else "null"
    buy_amt  = f"oi.`{ITEM_BUYING_AMOUNT}`" if _has_item(ITEM_BUYING_AMOUNT) else "null"
    orc      = f"oi.`{ITEM_ORC}`" if _has_item(ITEM_ORC) else "null"
    if _has_item(ITEM_MARGIN):
        margin = f"oi.`{ITEM_MARGIN}`"
    elif _has_item(ITEM_BUYING_AMOUNT):
        margin = f"(oi.amount - oi.`{ITEM_BUYING_AMOUNT}`)"
    else:
        margin = "null"

    rows = frappe.db.sql(f"""
        select o.name opportunity, o.customer_name customer, o.creation creation,
               o.opportunity_type opportunity_type, o.sales_stage sales_stage,
               oi.item_code item_code, oi.item_name item_name, oi.brand brand,
               oi.qty qty, oi.rate rate, oi.amount amount,
               {buy_rate} buying_rate, {buy_amt} buying_amount,
               {orc} orc, {margin} margin,
               o.expected_closing expected_closing,
               o.`{SALES_PERSON_FIELD}` sales_person
        from `tabOpportunity` o
        inner join `tabOpportunity Item` oi on oi.parent = o.name
        where {where}
        order by o.`{DATE_FIELD}` desc, oi.idx""", p, as_dict=True)

    columns = [
        _col("ID / Customer", "opportunity", "OppParty", 300),
        _col("Item", "item_code", "ItemMeta", 300),
        _col("Qty", "qty", "Float", 70, "right"),
        _col("Rate", "rate", "Currency", 110, "right"),
        _col("Amount", "amount", "Currency", 120, "right"),
        _col("Buying rate", "buying_rate", "Currency", 110, "right"),
        _col("Buying amt", "buying_amount", "Currency", 120, "right"),
        _col("ORC", "orc", "Data", 80, "right"),
        _col("Margin", "margin", "Currency", 120, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 2. Sales-stage funnel
# ===========================================================================
def _stage_funnel(filters, scope_users):
    where, p = _base(filters, scope_users)
    rows = frappe.db.sql(f"""
        select coalesce(o.sales_stage,'(none)') stage, count(*) cnt,
               sum(o.`{AMOUNT_FIELD}`) amount
        from `tabOpportunity` o where {where}
        group by o.sales_stage order by amount desc""", p, as_dict=True)

    total_cnt = sum(cint(r.cnt) for r in rows)
    total_amt = sum(flt(r.amount) for r in rows)
    prev = None
    for r in rows:
        r["dropoff"] = (round((prev - cint(r.cnt)) / prev * 100.0, 1) if prev else 0.0)
        prev = cint(r.cnt)

    summary = [
        _card("Stages", len(rows), "Int", "blue"),
        _card("Total opportunities", total_cnt, "Int", "blue"),
        _card("Total pipeline", total_amt, "Currency", "orange"),
    ]
    chart = _bar("Pipeline by stage", [r.stage for r in rows], [flt(r.amount) for r in rows])
    columns = [
        _col("Sales stage", "stage", "Data", 200),
        _col("Count", "cnt", "Int", 90, "right"),
        _col("Value", "amount", "Currency", 140, "right"),
        _col("Drop-off vs prev", "dropoff", "Percent", 130, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 3. Forecast by expected closing
# ===========================================================================
def _forecast(filters, scope_users):
    where, p = _base(filters, scope_users)
    where += " and o.status in %(open_s)s and o.expected_closing is not null"
    p["open_s"] = OPEN_STATUSES
    rows = frappe.db.sql(f"""
        select date_format(o.expected_closing,'%%Y-%%m') month, count(*) cnt,
               sum(o.`{AMOUNT_FIELD}`) amount,
               sum(o.`{AMOUNT_FIELD}`*o.probability/100.0) weighted
        from `tabOpportunity` o where {where}
        group by month order by month""", p, as_dict=True)

    today = getdate(nowdate())
    d30 = d60 = d90 = 0.0
    near = frappe.db.sql(f"""
        select o.expected_closing ec, (o.`{AMOUNT_FIELD}`*o.probability/100.0) w
        from `tabOpportunity` o where {where}""", p, as_dict=True)
    for r in near:
        if not r.ec:
            continue
        gap = date_diff(getdate(r.ec), today)
        if 0 <= gap <= 30: d30 += flt(r.w)
        if 0 <= gap <= 60: d60 += flt(r.w)
        if 0 <= gap <= 90: d90 += flt(r.w)

    summary = [
        _card("Weighted next 30d", d30, "Currency", "orange"),
        _card("Next 60d", d60, "Currency", "yellow"),
        _card("Next 90d", d90, "Currency", "yellow"),
    ]
    chart = {"type": "bar", "labels": [r.month for r in rows],
             "datasets": [{"name": _("Weighted"), "values": [flt(r.weighted) for r in rows]},
                          {"name": _("Total"), "values": [flt(r.amount) for r in rows]}]}
    columns = [
        _col("Closing month", "month", "Data", 140),
        _col("Count", "cnt", "Int", 90, "right"),
        _col("Pipeline", "amount", "Currency", 140, "right"),
        _col("Weighted", "weighted", "Currency", 140, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 4. Aging & stuck deals
# ===========================================================================
def _aging(filters, scope_users):
    where, p = _base(filters, scope_users)
    where += " and o.status in %(open_s)s"
    p["open_s"] = OPEN_STATUSES
    rows = frappe.db.sql(f"""
        select o.name opportunity, o.customer_name customer, o.status status,
               o.`{SALES_PERSON_FIELD}` sales_person, o.`{AMOUNT_FIELD}` amount,
               datediff(curdate(), o.`{DATE_FIELD}`) age_days
        from `tabOpportunity` o where {where}
        order by age_days desc""", p, as_dict=True)

    buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    for r in rows:
        a = cint(r.age_days)
        key = "0-30" if a <= 30 else "31-60" if a <= 60 else "61-90" if a <= 90 else "90+"
        r["bucket"] = key
        buckets[key] += 1

    ages = [cint(r.age_days) for r in rows]
    summary = [
        _card("Open deals", len(rows), "Int", "blue"),
        _card("Avg age (days)", round(sum(ages) / len(ages), 0) if ages else 0, "Int", "orange"),
        _card("Oldest (days)", max(ages) if ages else 0, "Int", "red"),
        _card("Stuck 90+ days", buckets["90+"], "Int", "red"),
    ]
    chart = _bar("Open deals by age", list(buckets.keys()), list(buckets.values()))
    columns = [
        _col("Opportunity", "opportunity", "Link", 130, options="Opportunity"),
        _col("Customer", "customer", "Data", 190),
        _col("Status", "status", "Data", 100),
        _col("Sales person", "sales_person", "Link", 150, options="User"),
        _col("Amount", "amount", "Currency", 120, "right"),
        _col("Age (days)", "age_days", "Int", 100, "right"),
        _col("Bucket", "bucket", "Data", 90),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 5. Sales-person leaderboard
# ===========================================================================
def _leaderboard(filters, scope_users):
    where, p = _base(filters, scope_users)
    raw = frappe.db.sql(f"""
        select o.`{SALES_PERSON_FIELD}` sales_person, o.status status,
               o.`{AMOUNT_FIELD}` amount, o.probability probability
        from `tabOpportunity` o where {where}""", p, as_dict=True)

    agg = {}
    for r in raw:
        k = r.sales_person or _("Unassigned")
        a = agg.setdefault(k, {"sales_person": k, "open_cnt": 0, "won": 0, "lost": 0,
                               "weighted": 0.0, "won_value": 0.0})
        if r.status in OPEN_STATUSES:
            a["open_cnt"] += 1
            a["weighted"] += flt(r.amount) * flt(r.probability) / 100.0
        if r.status in WON_STATUSES:
            a["won"] += 1; a["won_value"] += flt(r.amount)
        if r.status in LOST_STATUSES:
            a["lost"] += 1
    out = list(agg.values())
    for a in out:
        a["win_rate"] = _win_rate(a["won"], a["lost"])
    out.sort(key=lambda x: x["won_value"], reverse=True)

    top = out[0]["sales_person"] if out else "-"
    team_won = sum(a["won"] for a in out)
    team_lost = sum(a["lost"] for a in out)
    summary = [
        _card("Sales people", len(out), "Int", "blue"),
        _card("Top performer", top, "Data", "green"),
        _card("Team won value", sum(a["won_value"] for a in out), "Currency", "green"),
        _card("Team win rate", _win_rate(team_won, team_lost), "Percent", "green"),
    ]
    chart = _bar("Won value by sales person",
                 [a["sales_person"] for a in out[:10]], [a["won_value"] for a in out[:10]])
    columns = [
        _col("Sales person", "sales_person", "Link", 160, options="User"),
        _col("Open", "open_cnt", "Int", 70, "right"),
        _col("Won", "won", "Int", 70, "right"),
        _col("Lost", "lost", "Int", 70, "right"),
        _col("Win rate", "win_rate", "Percent", 90, "right"),
        _col("Weighted", "weighted", "Currency", 130, "right"),
        _col("Won value", "won_value", "Currency", 130, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": out}


# ===========================================================================
# 6. Win / loss analysis
# ===========================================================================
def _win_loss(filters, scope_users):
    where, p = _base(filters, scope_users)
    raw = frappe.db.sql(f"""
        select o.`{SALES_PERSON_FIELD}` sales_person, o.status status, o.`{AMOUNT_FIELD}` amount
        from `tabOpportunity` o where {where}
          and o.status in %(decided)s""", {**p, "decided": WON_STATUSES + LOST_STATUSES}, as_dict=True)

    agg = {}
    won = lost = 0
    won_v = lost_v = 0.0
    for r in raw:
        k = r.sales_person or _("Unassigned")
        a = agg.setdefault(k, {"sales_person": k, "won": 0, "lost": 0, "won_value": 0.0, "lost_value": 0.0})
        if r.status in WON_STATUSES:
            a["won"] += 1; a["won_value"] += flt(r.amount); won += 1; won_v += flt(r.amount)
        else:
            a["lost"] += 1; a["lost_value"] += flt(r.amount); lost += 1; lost_v += flt(r.amount)
    out = list(agg.values())
    for a in out:
        a["win_rate"] = _win_rate(a["won"], a["lost"])
    out.sort(key=lambda x: x["won_value"], reverse=True)

    summary = [
        _card("Won", won, "Int", "green"),
        _card("Lost", lost, "Int", "red"),
        _card("Win rate", _win_rate(won, lost), "Percent", "green"),
        _card("Avg won deal", round(won_v / won, 0) if won else 0, "Currency", "green"),
    ]
    chart = {"type": "bar", "labels": [_("Won"), _("Lost")],
             "datasets": [{"name": _("Value"), "values": [won_v, lost_v]}]}
    columns = [
        _col("Sales person", "sales_person", "Link", 160, options="User"),
        _col("Won", "won", "Int", 70, "right"),
        _col("Lost", "lost", "Int", 70, "right"),
        _col("Win rate", "win_rate", "Percent", 90, "right"),
        _col("Won value", "won_value", "Currency", 130, "right"),
        _col("Lost value", "lost_value", "Currency", 130, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": out}


# ===========================================================================
# 7. Conversion trend (monthly created vs converted)
# ===========================================================================
def _conversion_trend(filters, scope_users):
    where, p = _base(filters, scope_users)
    rows = frappe.db.sql(f"""
        select date_format(o.`{DATE_FIELD}`,'%%Y-%%m') month,
               count(*) created,
               sum(case when o.status in %(won)s then 1 else 0 end) converted
        from `tabOpportunity` o where {where}
        group by month order by month""", {**p, "won": WON_STATUSES}, as_dict=True)
    for r in rows:
        r["rate"] = round(cint(r.converted) / cint(r.created) * 100.0, 1) if r.created else 0.0

    tot_c = sum(cint(r.created) for r in rows)
    tot_w = sum(cint(r.converted) for r in rows)
    summary = [
        _card("Created", tot_c, "Int", "blue"),
        _card("Converted", tot_w, "Int", "green"),
        _card("Overall conversion", round(tot_w / tot_c * 100.0, 1) if tot_c else 0.0, "Percent", "green"),
    ]
    chart = {"type": "line", "labels": [r.month for r in rows],
             "datasets": [{"name": _("Created"), "values": [cint(r.created) for r in rows]},
                          {"name": _("Converted"), "values": [cint(r.converted) for r in rows]}]}
    columns = [
        _col("Month", "month", "Data", 140),
        _col("Created", "created", "Int", 100, "right"),
        _col("Converted", "converted", "Int", 100, "right"),
        _col("Conversion", "rate", "Percent", 110, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 8. Source effectiveness
# ===========================================================================
def _source_effectiveness(filters, scope_users):
    if not _has(SOURCE_FIELD):
        return _empty(_("Field '{0}' not found on Opportunity — set SOURCE_FIELD.").format(SOURCE_FIELD))
    where, p = _base(filters, scope_users)
    rows = frappe.db.sql(f"""
        select coalesce(o.`{SOURCE_FIELD}`,'(none)') source, count(*) cnt,
               sum(case when o.status in %(won)s then 1 else 0 end) converted,
               sum(case when o.status in %(won)s then o.`{AMOUNT_FIELD}` else 0 end) won_value
        from `tabOpportunity` o where {where}
        group by source order by won_value desc""", {**p, "won": WON_STATUSES}, as_dict=True)
    for r in rows:
        r["rate"] = round(cint(r.converted) / cint(r.cnt) * 100.0, 1) if r.cnt else 0.0

    best = rows[0]["source"] if rows else "-"
    summary = [
        _card("Sources", len(rows), "Int", "blue"),
        _card("Best source", best, "Data", "green"),
        _card("Total won value", sum(flt(r.won_value) for r in rows), "Currency", "green"),
    ]
    chart = _bar("Won value by source", [r.source for r in rows[:10]], [flt(r.won_value) for r in rows[:10]])
    columns = [
        _col("Source", "source", "Data", 180),
        _col("Count", "cnt", "Int", 90, "right"),
        _col("Converted", "converted", "Int", 100, "right"),
        _col("Conversion", "rate", "Percent", 110, "right"),
        _col("Won value", "won_value", "Currency", 140, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 9. Territory performance
# ===========================================================================
def _territory_performance(filters, scope_users):
    if not _has(TERRITORY_FIELD):
        return _empty(_("Field '{0}' not found on Opportunity — set TERRITORY_FIELD.").format(TERRITORY_FIELD))
    where, p = _base(filters, scope_users)
    rows = frappe.db.sql(f"""
        select coalesce(o.`{TERRITORY_FIELD}`,'(none)') territory, count(*) cnt,
               sum(case when o.status in %(won)s then 1 else 0 end) won,
               sum(case when o.status in %(lost)s then 1 else 0 end) lost,
               sum(case when o.status in %(won)s then o.`{AMOUNT_FIELD}` else 0 end) won_value
        from `tabOpportunity` o where {where}
        group by territory order by won_value desc""",
        {**p, "won": WON_STATUSES, "lost": LOST_STATUSES}, as_dict=True)
    for r in rows:
        r["win_rate"] = _win_rate(cint(r.won), cint(r.lost))

    summary = [
        _card("Territories", len(rows), "Int", "blue"),
        _card("Total won value", sum(flt(r.won_value) for r in rows), "Currency", "green"),
    ]
    chart = _bar("Won value by territory", [r.territory for r in rows[:10]], [flt(r.won_value) for r in rows[:10]])
    columns = [
        _col("Territory", "territory", "Data", 180),
        _col("Count", "cnt", "Int", 90, "right"),
        _col("Won", "won", "Int", 70, "right"),
        _col("Win rate", "win_rate", "Percent", 90, "right"),
        _col("Won value", "won_value", "Currency", 140, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 10. Top accounts
# ===========================================================================
def _top_accounts(filters, scope_users):
    where, p = _base(filters, scope_users)
    rows = frappe.db.sql(f"""
        select coalesce(o.customer_name, o.party_name, '(none)') customer, count(*) cnt,
               sum(o.`{AMOUNT_FIELD}`) total_value,
               sum(case when o.status in %(won)s then o.`{AMOUNT_FIELD}` else 0 end) won_value
        from `tabOpportunity` o where {where}
        group by customer order by total_value desc limit 50""",
        {**p, "won": WON_STATUSES}, as_dict=True)

    summary = [
        _card("Accounts", len(rows), "Int", "blue"),
        _card("Total value", sum(flt(r.total_value) for r in rows), "Currency", "orange"),
        _card("Won value", sum(flt(r.won_value) for r in rows), "Currency", "green"),
    ]
    chart = _bar("Top accounts by value", [r.customer for r in rows[:10]], [flt(r.total_value) for r in rows[:10]])
    columns = [
        _col("Customer", "customer", "Data", 240),
        _col("Opportunities", "cnt", "Int", 120, "right"),
        _col("Total value", "total_value", "Currency", 150, "right"),
        _col("Won value", "won_value", "Currency", 150, "right"),
    ]
    return {"summary": summary, "chart": chart, "columns": columns, "rows": rows}


# ===========================================================================
# 11. Follow-up / next action
# ===========================================================================
def _follow_up(filters, scope_users):
    if not _has(CONTACT_DATE_FIELD):
        return _empty(_("Field '{0}' not found on Opportunity — set CONTACT_DATE_FIELD.").format(CONTACT_DATE_FIELD))
    where, p = _base(filters, scope_users)
    where += " and o.status in %(open_s)s"
    p["open_s"] = OPEN_STATUSES
    rows = frappe.db.sql(f"""
        select o.name opportunity, o.customer_name customer, o.status status,
               o.`{SALES_PERSON_FIELD}` sales_person, o.`{AMOUNT_FIELD}` amount,
               o.`{CONTACT_DATE_FIELD}` last_contact,
               datediff(curdate(), o.`{CONTACT_DATE_FIELD}`) overdue_days
        from `tabOpportunity` o where {where}
        order by (o.`{CONTACT_DATE_FIELD}` is null) desc, overdue_days desc""", p, as_dict=True)

    overdue = sum(1 for r in rows if r.last_contact and cint(r.overdue_days) > 0)
    none_set = sum(1 for r in rows if not r.last_contact)
    summary = [
        _card("Open deals", len(rows), "Int", "blue"),
        _card("Overdue follow-ups", overdue, "Int", "red"),
        _card("No contact date", none_set, "Int", "orange"),
    ]
    columns = [
        _col("Opportunity", "opportunity", "Link", 130, options="Opportunity"),
        _col("Customer", "customer", "Data", 190),
        _col("Status", "status", "Data", 100),
        _col("Sales person", "sales_person", "Link", 150, options="User"),
        _col("Amount", "amount", "Currency", 120, "right"),
        _col("Last contact", "last_contact", "Date", 120),
        _col("Overdue (days)", "overdue_days", "Int", 120, "right"),
    ]
    return {"summary": summary, "chart": None, "columns": columns, "rows": rows}


# ===========================================================================
# chart helper
# ===========================================================================
def _bar(name, labels, values):
    if not labels:
        return None
    return {"type": "bar", "labels": list(labels),
            "datasets": [{"name": _(name), "values": [flt(v) for v in values]}]}