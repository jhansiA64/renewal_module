# Copyright (c) 2026, 64 Network Security Pvt. Ltd.
# Opportunity dashboard — AssetIQ-style, 5 tabs, distinct visual per tab.
# Tabs: overview, pipeline, forecast, salesperson, conversion.

import frappe
from frappe import _
from frappe.utils import (
    flt, cint, getdate, nowdate, date_diff, add_to_date,
    get_first_day, get_last_day,
)

from renewal_module.custom_module.page.opp_reports.opp_reports import (
    _resolve_scope, _base, _employee_for_user, _has,
    SALES_PERSON_FIELD, AMOUNT_FIELD, ORG_ROLES,
    WON_STATUSES, LOST_STATUSES, OPEN_STATUSES,
)

SOURCE_FIELD = "source"
STAGE_ORDER = ["Prospecting", "Qualification", "Needs Analysis", "Value Proposition",
               "Identifying Decision Makers", "Perception Analysis",
               "Proposal/Price Quote", "Negotiation/Review"]
C = {"ac": "#2f4de0", "ok": "#1a8f5c", "am": "#e0a000", "dg": "#c42b2b",
     "pu": "#7c3aed", "tl": "#0b8c78", "mu": "#97a2bf", "sk": "#0e6fba", "pk": "#d6457d"}
PALETTE = [C["ac"], C["pu"], C["tl"], C["ok"], C["am"], C["sk"], C["pk"], C["mu"]]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@frappe.whitelist()
def get_meta():
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    allowed = ["My"]

    # Team Lead: has the Sales Team Lead role OR manages anyone (Employee reports_to)
    is_lead = ("Sales Team Lead" in roles) or _has_reports(user)
    if is_lead:
        allowed.append("My Team")

    # Org Head: System Manager only
    if "System Manager" in roles:
        if "My Team" not in allowed:
            allowed.append("My Team")
        allowed.append("Organization")

    # Per-scope tab set: the page rebuilds its tab strip from this on scope change.
    # key = server view, label/icon = how the tab shows. People-tab adapts per scope.
    base = [
        {"key": "overview", "label": "Overview", "icon": "ti-layout-grid"},
        {"key": "pipeline", "label": "Pipeline & Trends", "icon": "ti-chart-line"},
        {"key": "forecast", "label": "Forecast", "icon": "ti-calendar-stats"},
    ]
    tabs = {
        "My": base + [
            {"key": "salesperson", "label": "My Performance", "icon": "ti-user-star"},
            {"key": "conversion", "label": "Conversion", "icon": "ti-trending-up"},
        ],
        "My Team": base + [
            {"key": "salesperson", "label": "Sales Person", "icon": "ti-users"},
            {"key": "conversion", "label": "Conversion", "icon": "ti-trending-up"},
        ],
        "Organization": base + [
            {"key": "teams", "label": "Teams", "icon": "ti-building-community"},
            {"key": "conversion", "label": "Conversion", "icon": "ti-trending-up"},
        ],
    }
    return {"scopes": allowed, "tabs": tabs}


@frappe.whitelist()
def get_dashboard(view="overview", scope="My", filters=None):
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    filters = frappe._dict(filters)
    filters["scope"] = scope
    su = _resolve_scope_dash(filters)
    rows = _heads(filters, su)
    return {
        "pipeline": _pipeline, "forecast": _forecast, "salesperson": _salesperson,
        "conversion": _conversion, "teams": _teams,
    }.get(view, _overview)(rows, filters, su, scope)


@frappe.whitelist()
def scope_people(scope="My Team"):
    """Sales people available in the current scope, for the Sales Person filter.
    Resolves the scope WITHOUT any sales_person narrowing, then lists distinct
    owners that actually have opportunities, with display names."""
    f = frappe._dict({"scope": scope})
    su = _resolve_scope_dash(f)
    if su is None:
        rows = frappe.db.sql(
            f"""select distinct o.`{SALES_PERSON_FIELD}` u from `tabOpportunity` o
                where o.`{SALES_PERSON_FIELD}` is not null limit 500""", as_dict=True)
        users = [r.u for r in rows]
    else:
        users = [u for u in su if u != "__none__"]
    if not users:
        return []
    names = frappe.db.sql(
        """select name value, coalesce(nullif(full_name,''), name) label
           from `tabUser` where name in %(u)s order by full_name""",
        {"u": tuple(users)}, as_dict=True)
    return names


def _has_reports(user):
    """True if this user manages anyone (is a reports_to target for some Employee)."""
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not emp:
        return False
    return bool(frappe.db.exists("Employee", {"reports_to": emp}))


def _resolve_scope_dash(filters):
    """Scope resolver with the dashboard's role rules + optional sales_person filter.
    Re-validates server-side so a user cannot widen their scope by tampering."""
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    requested = filters.get("scope") or "My"

    if requested == "Organization":
        if "System Manager" not in roles:
            frappe.throw(_("You are not permitted to view the Organization scope."))
        base = None  # all users
    elif requested == "My Team":
        if not (("Sales Team Lead" in roles) or _has_reports(user) or "System Manager" in roles):
            frappe.throw(_("You are not permitted to view the Team scope."))
        emp = _employee_for_user(user)
        base = _team_user_ids(emp) if emp else [user]
    else:
        base = [user]

    # Sales Person filter (Team/Org only) narrows within the allowed set.
    picked = _as_list(filters.get("sales_person"))
    if picked and requested in ("My Team", "Organization"):
        if base is None:
            return picked
        return [u for u in base if u in picked] or ["__none__"]
    return base


def _team_user_ids(emp):
    rows = frappe.db.sql(
        """select user_id from `tabEmployee`
           where lft >= %(lft)s and rgt <= %(rgt)s
             and user_id is not null and user_id != ''""",
        {"lft": emp.lft, "rgt": emp.rgt}, as_dict=True)
    users = [r.user_id for r in rows]
    if frappe.session.user not in users:
        users.append(frappe.session.user)
    return users


def _as_list(v):
    if v in (None, ""):
        return []
    if isinstance(v, str):
        v = [v]
    return [x for x in v if x not in (None, "")]


# ---------------------------------------------------------------------------
def _heads(filters, su):
    where, p = _base(filters, su)
    return frappe.db.sql(f"""
        select o.name, o.status status, o.sales_stage sales_stage, o.opportunity_type opp_type,
               o.`{AMOUNT_FIELD}` amount, o.probability probability,
               (o.`{AMOUNT_FIELD}`*o.probability/100.0) weighted,
               o.customer_name customer, o.creation creation,
               o.expected_closing expected_closing, o.`{SALES_PERSON_FIELD}` sp
        from `tabOpportunity` o where {where}""", p, as_dict=True)


def _kpi(label, value, datatype, indicator, icon):
    return {"label": _(label), "value": value, "datatype": datatype, "indicator": indicator, "icon": icon}


def _win_rate(won, lost):
    d = won + lost
    return round(won / d * 100.0, 1) if d else 0.0


def _mkey(dt):
    return (str(dt) or "")[:7] if dt else ""


def _monthly_cw(rows):
    m = {}
    for r in rows:
        k = _mkey(r.creation)
        if not k:
            continue
        d = m.setdefault(k, {"c": 0, "w": 0})
        d["c"] += 1
        if r.status in WON_STATUSES:
            d["w"] += 1
    keys = sorted(m.keys())[-8:]
    return keys, [m[k]["c"] for k in keys], [m[k]["w"] for k in keys]


def _hbars(rows, keyfn, valfn, color, money=False, limit=6):
    agg = {}
    for r in rows:
        k = keyfn(r) or _("(none)")
        agg[k] = agg.get(k, 0) + valfn(r)
    items = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    mx = items[0][1] if items else 1
    return [{"label": k, "value": v, "color": color,
             "pct": round((v / mx * 100.0) if mx else 0, 1), "money": money} for k, v in items]


def _stage_sorted(keys):
    known = [s for s in STAGE_ORDER if s in keys]
    extra = [k for k in keys if k not in STAGE_ORDER]
    return known + extra


# ===========================================================================
# Period range + dashboard filter pipeline (Overview)
# ===========================================================================
def _half_range(d):
    if d.month <= 6:
        return getdate(f"{d.year}-01-01"), getdate(f"{d.year}-06-30")
    return getdate(f"{d.year}-07-01"), getdate(f"{d.year}-12-31")


def _period_range(filters):
    """Return (cur_from, cur_to, prev_from, prev_to). Period filters on transaction_date.
    None range = all time (no comparison)."""
    from frappe.utils import (get_first_day, get_last_day, get_first_day_of_week,
                              get_last_day_of_week, get_quarter_start, get_quarter_ending,
                              get_year_start, get_year_ending)
    key = (filters.get("timespan") or "").strip()
    today = getdate(nowdate())
    wk = lambda d: (get_first_day_of_week(d), get_last_day_of_week(d))
    mo = lambda d: (get_first_day(d), get_last_day(d))
    qt = lambda d: (get_quarter_start(d), get_quarter_ending(d))
    yr = lambda d: (get_year_start(d), get_year_ending(d))

    if not key or key == "all":
        return None, None, None, None
    if key == "custom":
        cf = getdate(filters.get("from_date")) if filters.get("from_date") else None
        ct = getdate(filters.get("to_date")) if filters.get("to_date") else None
        if cf and ct:
            span = date_diff(ct, cf) + 1
            return cf, ct, add_to_date(cf, days=-span), add_to_date(cf, days=-1)
        return cf, ct, None, None
    if key == "this_half":
        cf, ct = _half_range(today)
        return cf, ct, add_to_date(cf, months=-6), add_to_date(ct, months=-6)

    spec = {
        "this_week": (wk, today, ("days", -7)), "last_week": (wk, add_to_date(today, days=-7), ("days", -7)),
        "next_week": (wk, add_to_date(today, days=7), ("days", -7)),
        "this_month": (mo, today, ("months", -1)), "last_month": (mo, add_to_date(today, months=-1), ("months", -1)),
        "next_month": (mo, add_to_date(today, months=1), ("months", -1)),
        "this_quarter": (qt, today, ("months", -3)), "last_quarter": (qt, add_to_date(today, months=-3), ("months", -3)),
        "next_quarter": (qt, add_to_date(today, months=3), ("months", -3)),
        "this_year": (yr, today, ("years", -1)), "last_year": (yr, add_to_date(today, years=-1), ("years", -1)),
    }
    if key in spec:
        fn, base, (unit, n) = spec[key]
        cf, ct = fn(base)
        pf, pt = fn(add_to_date(base, **{unit: n}))
        return cf, ct, pf, pt
    return None, None, None, None


def _dash_heads(filters, su, df=None, dt=None):
    """Overview query: scope + brand (Opportunity Item) + item category (Item.item_group)
    + transaction_date range."""
    cond, p = ["1=1"], {}
    if df:
        cond.append("o.transaction_date >= %(df)s"); p["df"] = df
    if dt:
        cond.append("o.transaction_date <= %(dt)s"); p["dt"] = dt
    if filters.get("company"):
        cond.append("o.company = %(co)s"); p["co"] = filters["company"]
    if su is not None:
        if not su:
            cond.append("1=0")
        else:
            cond.append(f"o.`{SALES_PERSON_FIELD}` in %(su)s"); p["su"] = tuple(su)
    brands = _as_list(filters.get("brand"))
    if brands:
        cond.append("exists (select 1 from `tabOpportunity Item` oi "
                    "where oi.parent=o.name and oi.brand in %(br)s)")
        p["br"] = tuple(brands)
    cats = _as_list(filters.get("item_category"))
    if cats:
        cond.append("exists (select 1 from `tabOpportunity Item` oi "
                    "join `tabItem` it on it.name=oi.item_code "
                    "where oi.parent=o.name and it.item_group in %(cat)s)")
        p["cat"] = tuple(cats)
    where = " and ".join(cond)
    return frappe.db.sql(f"""
        select o.name, o.status status, o.sales_stage sales_stage,
               o.`{AMOUNT_FIELD}` amount, o.probability probability,
               (o.`{AMOUNT_FIELD}`*o.probability/100.0) weighted,
               o.customer_name customer, o.creation creation, o.modified modified,
               o.transaction_date txn, o.expected_closing expected_closing,
               o.`{SALES_PERSON_FIELD}` sp
        from `tabOpportunity` o where {where}
        order by o.transaction_date desc""", p, as_dict=True)


def _metric_value(rows, metric):
    if metric == "total":
        return len(rows)
    if metric == "open_pipeline":
        return sum(flt(r.amount) for r in rows if r.status in OPEN_STATUSES)
    if metric == "weighted":
        return sum(flt(r.weighted) for r in rows if r.status in OPEN_STATUSES)
    if metric == "won_value":
        return sum(flt(r.amount) for r in rows if r.status in WON_STATUSES)
    if metric == "win_rate":
        won = sum(1 for r in rows if r.status in WON_STATUSES)
        lost = sum(1 for r in rows if r.status in LOST_STATUSES)
        return _win_rate(won, lost)
    return 0


def _metric_rows(rows, metric):
    if metric == "open_pipeline" or metric == "weighted":
        return [r for r in rows if r.status in OPEN_STATUSES]
    if metric == "won_value":
        return [r for r in rows if r.status in WON_STATUSES]
    if metric == "win_rate":
        return [r for r in rows if r.status in (WON_STATUSES + LOST_STATUSES)]
    return list(rows)


def _delta(cur, prev):
    if prev is None:
        return None
    if not prev:
        return {"pct": None, "dir": "up" if cur else "flat", "label": _("vs prev")}
    pct = round((cur - prev) / prev * 100.0, 1)
    return {"pct": pct, "dir": "up" if pct > 0 else ("down" if pct < 0 else "flat"), "label": _("vs prev")}


# ===========================================================================
# Overview — KPIs + trend + status donut + by-rep bars + activity HEATMAP
# ===========================================================================

# ===========================================================================
# Helpers for the four "sd-style" panels (quota / forecast / avt / activity /
# lost reasons / stalled / renewals / quotes)
# ===========================================================================

# Target placeholder: ~ ₹50L per rep per quarter. Replace with your real source.
TARGET_PER_USER_PER_MONTH = 1666667.0


def _money(v):
    """Short ₹ format matching the JS _short()."""
    v = flt(v)
    if v >= 1e7:
        return "\u20b9" + ("%.2f" % (v / 1e7)).rstrip("0").rstrip(".") + " Cr"
    if v >= 1e5:
        return "\u20b9" + ("%.2f" % (v / 1e5)).rstrip("0").rstrip(".") + " L"
    return "\u20b9" + "{:,.0f}".format(v)


def _n_months(cf, ct):
    if not (cf and ct):
        return 1
    cf, ct = getdate(cf), getdate(ct)
    return max(1, (ct.year - cf.year) * 12 + (ct.month - cf.month) + 1)


def _all_owner_users():
    rows = frappe.db.sql(
        f"""select distinct `{SALES_PERSON_FIELD}` u from `tabOpportunity`
            where ifnull(`{SALES_PERSON_FIELD}`,'') != '' limit 1000""", as_dict=True)
    return [r.u for r in rows]


def _period_target(su, cf, ct):
    """Absolute ₹ target for the scope+period. Replace body with your real source."""
    n_users = (len(su) if su else len(_all_owner_users())) or 1
    return TARGET_PER_USER_PER_MONTH * n_users * _n_months(cf, ct)


def _pace_pct(cf, ct):
    """% of the period elapsed as of today (0..100)."""
    if not (cf and ct):
        return 0
    cf, ct, today = getdate(cf), getdate(ct), getdate(nowdate())
    total = date_diff(ct, cf) + 1
    done = date_diff(min(today, ct), cf) + 1
    return max(0, min(100, round(done / total * 100.0))) if total else 0


def _achieved_by_month(rows, cf, ct):
    """Won value per month across the period (for Achieved vs Target bars)."""
    if not (cf and ct):
        return []
    by, d, end = {}, getdate(cf), getdate(ct)
    while d <= end:
        by[_mkey(d)] = 0.0
        d = add_to_date(get_first_day(d), months=1)
    for r in rows:
        if r.status in WON_STATUSES:
            k = _mkey(r.get("txn") or r.get("creation"))
            if k in by:
                by[k] += flt(r.amount)
    out = []
    for k in sorted(by.keys()):
        mon = getdate(k + "-01").strftime("%b")
        out.append({"label": f"{mon} · {_money(by[k])}", "achieved": by[k]})
    return out


# ---- doctype config: fill these in from your schema ----
# ---- activity doctype config ----
# ---- activity doctype config (owner-based) ----
CALL_DT,  CALL_BY,  CALL_DATE  = "Call List",   "owner", "creation"     # confirmed: owner
# ===========================================================================
# Activity (Calls / Appointments / Tasks) — scope = owner OR participant
# ===========================================================================
# Call List: created by the user (owner). Appointment/Task: belongs to everyone
# in custom_participants / custom_users, not only the creator.
APPT_CHILD_DT, APPT_CHILD_USERFIELD = "Multiselect Users", "user"
TASK_CHILD_DT, TASK_CHILD_USERFIELD = "Task Users",        "user"


def _safe_count(sql, p):
    try:
        return cint(frappe.db.sql(sql, p)[0][0])
    except Exception:
        return 0


def _owner_or_participant(alias, parent_dt, child_dt, user_field):
    """owned by a scoped user OR has one as a participant (parenttype-guarded)."""
    return (f"({alias}.owner in %(u)s "
            f"or exists (select 1 from `tab{child_dt}` c "
            f"where c.parent = {alias}.name and c.parenttype = '{parent_dt}' "
            f"and c.`{user_field}` in %(u)s))")


def _activity_rows(su, cf, ct):
    users = (su if su is not None else _all_owner_users()) or ["__none__"]
    base = {"u": tuple(users), "cf": cf, "ct": ct}

    calls = _safe_count(
        """select count(*) from `tabCall List`
           where owner in %(u)s and date(creation) between %(cf)s and %(ct)s""", base)

    appts = _safe_count(
        f"""select count(distinct a.name) from `tabAppointment` a
            where {_owner_or_participant('a', 'Appointment', APPT_CHILD_DT, APPT_CHILD_USERFIELD)}
              and date(a.creation) between %(cf)s and %(ct)s""", base)

    tasks = _safe_count(
        f"""select count(distinct t.name) from `tabTask` t
            where {_owner_or_participant('t', 'Task', TASK_CHILD_DT, TASK_CHILD_USERFIELD)}
              and t.status not in ('Completed','Cancelled')""", {"u": tuple(users)})

    return [
        {"icon": "ti-phone", "label": _("Calls made"), "value": "{:,}".format(calls),
         "drill": "activity", "key": "calls"},
        {"icon": "ti-calendar-event", "label": _("Appointments"), "value": "{:,}".format(appts),
         "drill": "activity", "key": "appointments"},
        {"icon": "ti-checkbox", "label": _("Open tasks"), "value": "{:,}".format(tasks), "warn": True,
         "drill": "activity", "key": "tasks"},
    ]


def _activity_drill(su, cf, ct, key):
    users = (su if su is not None else _all_owner_users()) or ["__none__"]

    def _participants(parent_names, child_dt, user_field, parent_dt):
        """Return {parent_name: [user, user, ...]} for a batch of parents."""
        if not parent_names:
            return {}
        rows = frappe.db.sql(f"""
            select c.parent, c.`{user_field}` u
            from `tab{child_dt}` c
            where c.parenttype = %(pt)s and c.parent in %(p)s""",
            {"pt": parent_dt, "p": tuple(parent_names)}, as_dict=True)
        out = {}
        for r in rows:
            out.setdefault(r.parent, []).append(r.u)
        return out

    if key == "calls":
        rows = frappe.db.sql(
            """select name, owner, creation dt from `tabCall List`
               where owner in %(u)s and date(creation) between %(cf)s and %(ct)s
               order by creation desc limit 200""",
            {"u": tuple(users), "cf": cf, "ct": ct}, as_dict=True)
        cols = [_("Call"), _("Owner"), _("Date")]
        body = [[{"v": r.name, "link": f"/app/call-list/{r.name}", "bold": True},
                 {"v": _name_of(r.owner), "muted": True},
                 {"v": str(r.dt or "-"), "muted": True}] for r in rows]

    elif key == "appointments":
        rows = frappe.db.sql(
            f"""select distinct a.name, a.owner, a.creation dt from `tabAppointment` a
                where {_owner_or_participant('a', 'Appointment', APPT_CHILD_DT, APPT_CHILD_USERFIELD)}
                  and date(a.creation) between %(cf)s and %(ct)s
                order by a.creation desc limit 200""",
            {"u": tuple(users), "cf": cf, "ct": ct}, as_dict=True)
        pmap = _participants([r.name for r in rows], APPT_CHILD_DT, APPT_CHILD_USERFIELD, "Appointment")
        cols = [_("Appointment"), _("Participants"), _("Owner"), _("Date")]
        body = [[{"v": r.name, "link": f"/app/appointment/{r.name}", "bold": True},
                 _people_cell(pmap.get(r.name, [])),
                 {"v": _name_of(r.owner), "muted": True},
                 {"v": str(r.dt or "-"), "muted": True}] for r in rows]

    else:  # tasks
        rows = frappe.db.sql(
            f"""select distinct t.name, t.owner, t.subject, t.status, t.modified dt from `tabTask` t
                where {_owner_or_participant('t', 'Task', TASK_CHILD_DT, TASK_CHILD_USERFIELD)}
                  and t.status not in ('Completed','Cancelled')
                order by t.modified desc limit 200""",
            {"u": tuple(users)}, as_dict=True)
        pmap = _participants([r.name for r in rows], TASK_CHILD_DT, TASK_CHILD_USERFIELD, "Task")
        cols = [_("Task"), _("Assigned users"), _("Status"), _("Updated")]
        body = [[{"stack": [{"t": r.subject or r.name, "strong": True},
                            {"t": r.name, "link": f"/app/task/{r.name}", "accent": True}]},
                 _people_cell(pmap.get(r.name, [])),
                 {"v": r.status or "-"},
                 {"v": str(r.dt or "-"), "muted": True}] for r in rows]

    return {"title": _(key.title()), "count": len(rows),
            "blocks": [{"type": "table", "w": "wide", "title": _(key.title()),
                        "columns": cols, "rows": body}]}


# ---- helpers for showing people in drill tables ----
_NAME_CACHE = {}

def _name_of(user):
    if not user:
        return "-"
    if user not in _NAME_CACHE:
        _NAME_CACHE[user] = frappe.db.get_value("User", user, "full_name") or user
    return _NAME_CACHE[user]


def _people_cell(user_ids):
    """Render a list of users as chips in one table cell."""
    if not user_ids:
        return {"v": "-", "muted": True}
    chips = [{"t": _name_of(u), "color": "#2f4de0"} for u in user_ids[:6]]
    if len(user_ids) > 6:
        chips.append({"t": f"+{len(user_ids) - 6}", "color": "#97a2bf"})
    return {"chips": chips}

def _lost_reason_rows(filters, su, cf, ct):
    """Top lost reasons from the standard Opportunity Lost Reason child table."""
    if not frappe.db.table_exists("Opportunity Lost Reason"):
        return []
    cond = ["o.status in %(ls)s", "o.transaction_date between %(cf)s and %(ct)s"]
    p = {"ls": tuple(LOST_STATUSES), "cf": cf, "ct": ct}
    if su is not None:
        if not su:
            return []
        cond.append(f"o.`{SALES_PERSON_FIELD}` in %(u)s"); p["u"] = tuple(su)
    try:
        rows = frappe.db.sql(f"""
            select coalesce(olr.lost_reason,'Other') k, count(*) c
            from `tabOpportunity Lost Reason` olr
            join `tabOpportunity` o on o.name = olr.parent
            where {" and ".join(cond)} group by k order by c desc limit 5""", p, as_dict=True)
    except Exception:
        return []
    tot = sum(r.c for r in rows) or 1
    return [{"label": r.k, "pct": round(r.c / tot * 100)} for r in rows]


def _stalled_data(rows):
    """Open opps with no activity in 14d, grouped by stage."""
    cutoff = add_to_date(getdate(nowdate()), days=-14)
    stl = [r for r in rows if r.status in OPEN_STATUSES
           and r.get("modified") and getdate(r.modified) < cutoff]
    by = {}
    for r in stl:
        by[r.sales_stage or _("(none)")] = by.get(r.sales_stage or _("(none)"), 0) + 1
    top = sorted(by.items(), key=lambda kv: kv[1], reverse=True)[:3]
    val = sum(flt(r.amount) for r in stl)
    return {"big": len(stl), "caption": f"{_('deals')} · {_money(val)} {_('at risk')}",
            "rows": [{"label": k, "value": v} for k, v in top]}


def _renewals_data(su):
    """Wire to your renewal_module doctype. Returns zeros if absent."""
    today = getdate(nowdate())
    DT, FIELD = "Renewal", "renewal_date"   # <-- adjust to your doctype + date field
    buckets = [{"label": _("30 days"), "value": 0},
               {"label": _("60 days"), "value": 0},
               {"label": _("90 days"), "value": 0}]
    if not frappe.db.exists("DocType", DT):
        return {"buckets": buckets, "flag": ""}
    try:
        for i, days in enumerate((30, 60, 90)):
            buckets[i]["value"] = frappe.db.count(
                DT, {FIELD: ["between", [today, add_to_date(today, days=days)]]})
    except Exception:
        pass
    return {"buckets": buckets, "flag": ""}


def _quotes_data(su):
    """Open Quotations (awaiting customer)."""
    if not frappe.db.table_exists("Quotation"):
        return {"big": 0, "caption": "", "rows": []}
    cond, p = ["q.status = 'Open'"], {}
    if su is not None:
        if not su:
            return {"big": 0, "caption": _("sent"), "rows": []}
        cond.append("q.owner in %(u)s"); p["u"] = tuple(su)
    try:
        r = frappe.db.sql(f"""select count(*) n, sum(q.grand_total) v
            from `tabQuotation` q where {" and ".join(cond)}""", p, as_dict=True)
        n = cint(r[0].n) if r else 0
        v = flt(r[0].v) if r else 0
    except Exception:
        n, v = 0, 0
    return {"big": n, "caption": f"{_('sent')} · {_money(v)} {_('awaiting')}",
            "rows": [{"label": _("Awaiting response"), "value": n}]}



def _overview(rows, filters, su, scope="My"):
    cf, ct, pf, pt = _period_range(filters)
    cur = _dash_heads(filters, su, cf, ct)
    prev = _dash_heads(filters, su, pf, pt) if pf else None

    def card(label, metric, datatype, ind, icon):
        v = _metric_value(cur, metric)
        c = _kpi(label, v, datatype, ind, icon)
        c["metric"] = metric

        # ✅ ADD SPARK DATA
        keys, created, wonm = _monthly_cw(cur)
        c["spark"] = created if metric == "total" else wonm

        d = _delta(v, _metric_value(prev, metric)) if prev else None
        if d:
            c["delta"] = d

        return c

    pre = {"My": _("My"), "My Team": _("Team"), "Organization": _("Org")}.get(scope, "")
    kpis = [
        card(f"{pre} opportunities".strip(), "total", "Int", "blue", "ti-briefcase"),
        card("Open pipeline", "open_pipeline", "Currency", "amber", "ti-businessplan"),
        card("Weighted pipeline", "weighted", "Currency", "blue", "ti-scale"),
        card("Won value", "won_value", "Currency", "green", "ti-trophy"),
        card("Win rate", "win_rate", "Percent", "purple", "ti-target-arrow"),
    ]

    total = len(cur)
    mk, cre, wonm = _monthly_cw(cur)
    trend = {"type": "trend", "w": "wide", "title": _("Opportunity trend"), "sub": _("Created vs won — monthly"),
             "xlabels": [m[5:] for m in mk],
             "series": [{"name": _("Created"), "color": C["ac"], "values": cre},
                        {"name": _("Won"), "color": C["ok"], "values": wonm}]}

    st = {}
    for r in cur:
        st[r.status or _("Unknown")] = st.get(r.status or _("Unknown"), 0) + 1
    sc = {"Open": C["ac"], "Quotation": C["am"], "Converted": C["ok"], "Lost": C["dg"], "Replied": C["mu"], "Closed": C["tl"]}
    donut = {"type": "donut", "w": "half", "title": _("By status"), "sub": _("Distribution"),
             "total": total, "total_label": _("opps"),
             "segments": [{"label": k, "value": v, "color": sc.get(k, C["mu"])}
                          for k, v in sorted(st.items(), key=lambda kv: kv[1], reverse=True)]}

    if scope == "My":
        side = {"type": "hbars", "w": "half", "title": _("My pipeline by stage"), "sub": _("Open value"),
                "bars": _hbars([r for r in cur if r.status in OPEN_STATUSES],
                               lambda r: r.sales_stage, lambda r: flt(r.amount), C["tl"], money=True)}
    else:
        side = {"type": "hbars", "w": "half", "title": _("By sales person"), "sub": _("Pipeline value"),
                "bars": _hbars(cur, lambda r: r.sp, lambda r: flt(r.amount), C["tl"], money=True)}

    heat = _heatmap(cur)
    open_rows = [r for r in cur if r.status in OPEN_STATUSES]
    stg_val, stg_cnt = {}, {}
    for r in open_rows:
        k = r.sales_stage or _("(none)")
        stg_val[k] = stg_val.get(k, 0) + flt(r.amount)
        stg_cnt[k] = stg_cnt.get(k, 0) + 1
    ordered = sorted(stg_val.keys(), key=lambda s: stg_val[s], reverse=True)
    top_v = stg_val[ordered[0]] if ordered else 1
    steps, prev_cnt = [], None
    for i, s in enumerate(ordered):
        v = stg_val[s]
        steps.append({"label": s, "value": v, "money": True, "count": stg_cnt[s],
                      "pct": round((v / top_v * 100.0) if top_v else 0, 1),
                      "dropoff": (round((prev_cnt - stg_cnt[s]) / prev_cnt * 100.0, 1) if prev_cnt else 0.0),
                      "color": PALETTE[i % len(PALETTE)]})
        prev_cnt = stg_cnt[s]
    funnel = {"type": "funnel_svg", "w": "half", "title": _("Sales stage funnel"),
              "sub": _("Open pipeline value · click a stage to drill"), "steps": steps}


    brand_segs, group_segs = _brand_itemgroup_donuts(filters, su, cf, ct)
    bt = sum(s["value"] for s in brand_segs)
    gt = sum(s["value"] for s in group_segs)
    dual = {"type": "dual_donut", "w": "half", "title": _("Pipeline mix"),
            "sub": _("By brand & item group · open value"),
            "left":  {"title": _("Brand"),      "total": bt, "total_label": _("value"), "segments": brand_segs},
            "right": {"title": _("Item group"), "total": gt, "total_label": _("value"), "segments": group_segs}}

       




    
    # --- Quota attainment + Forecast (image 1) ---
    won_val = sum(flt(r.amount) for r in cur if r.status in WON_STATUSES)
    open_val = sum(flt(r.amount) for r in cur if r.status in OPEN_STATUSES)
    wtd = sum(flt(r.weighted) for r in cur if r.status in OPEN_STATUSES)
    target = _period_target(su, cf, ct)          # <-- your target source (placeholder below)
    pct = round(won_val / target * 100.0, 1) if target else 0
    shortfall = max(0.0, target - won_val)
    pace = _pace_pct(cf, ct)
    quota = {"type": "quota", "w": "half", "title": _("Quota attainment"),
             "label": _("Quota attainment"), "pct": pct, "pace": pace,
             "achieved": won_val, "target": target, "shortfall": shortfall}
    

    new_w, renew_w = _newrenew_split(filters, su, cf, ct)
    forecast = {"type": "forecast_card", "w": "half", "title": _("Forecast"),
                "value": won_val + wtd,
                "caption": _("Closed {0} + weighted open {1}").format(_money(won_val), _money(wtd)),
                "split": {"new": new_w, "renewal": renew_w},      # ← add this
                "coverage": _("{0}× pipeline coverage").format(round(open_val / shortfall, 1) if shortfall else 0)}            

    # --- Achieved vs Target + Activity (image 2) ---
    avt = {"type": "avt", "w": "half", "title": _("Achieved vs target"),
           "target": target / max(1, _n_months(cf, ct)),
           "items": _achieved_by_month(cur, cf, ct)}
    activity = {"type": "actlist", "w": "half", "title": _("Activity"), "rows": _activity_rows(su, cf, ct)}

    # --- Why lost + Stalled (image 3) ---
    lost = {"type": "lostbars", "w": "half", "title": _("Why deals are lost"),
            "rows": _lost_reason_rows(filters, su, cf, ct)}
    stalled = {"type": "statlist", "w": "half", "title": _("Stalled · no activity 14d+"),
               "danger": True, **_stalled_data(cur)}

    # --- Renewals + Quotes (image 4) ---
    renew = {"type": "renewals", "w": "half", "title": _("Renewals due"), **_renewals_data(su)}
    quotes = {"type": "statlist", "w": "half", "title": _("Quotes outstanding"), **_quotes_data(su)}

    fu = get_followups(scope, frappe.as_json(filters))   # reuse the same call

    return {"kpis": kpis, "blocks": [
        quota, forecast, funnel, dual, avt, activity, lost, stalled, renew, quotes, trend, donut, side, heat],"followup_summary": fu["summary"]}


# ===========================================================================
# Card drill-down (Overview) + filter option lists
# ===========================================================================
SUBJECT_FIELD = "subject"
FORECAST_FIELD = "forecast"

def _drill_items(filters, su, df, dt, metric):
    """One row per Opportunity Item, for the drill-through table."""
    cond, p = ["1=1"], {}
    if df:
        cond.append("o.transaction_date >= %(df)s"); p["df"] = df
    if dt:
        cond.append("o.transaction_date <= %(dt)s"); p["dt"] = dt
    if filters.get("company"):
        cond.append("o.company = %(co)s"); p["co"] = filters["company"]
    if su is not None:
        if not su:
            cond.append("1=0")
        else:
            cond.append(f"o.`{SALES_PERSON_FIELD}` in %(su)s"); p["su"] = tuple(su)
    if metric in ("open_pipeline", "weighted"):
        cond.append("o.status in %(ostat)s"); p["ostat"] = OPEN_STATUSES
    elif metric == "won_value":
        cond.append("o.status in %(wstat)s"); p["wstat"] = WON_STATUSES
    elif metric == "win_rate":
        cond.append("o.status in %(dstat)s"); p["dstat"] = WON_STATUSES + LOST_STATUSES
    brands = _as_list(filters.get("brand"))
    if brands:
        cond.append("oi.brand in %(br)s"); p["br"] = tuple(brands)
    cats = _as_list(filters.get("item_category"))
    if cats:
        cond.append("it.item_group in %(cat)s"); p["cat"] = tuple(cats)
    where = " and ".join(cond)
    return frappe.db.sql(f"""
        select o.name oid, o.`{SUBJECT_FIELD}` subject, o.customer_name customer,
               o.`{SALES_PERSON_FIELD}` sp, oi.sales_stage sales_stage,
               oi.`{FORECAST_FIELD}` forecast, o.expected_closing expected_closing,
               oi.item_name item_name, oi.brand brand, it.item_group item_group,
               oi.qty qty, oi.rate rate, oi.amount amount
        from `tabOpportunity` o
        join `tabOpportunity Item` oi on oi.parent = o.name
        left join `tabItem` it on it.name = oi.item_code
        where {where}
        order by o.transaction_date desc
        limit 200""", p, as_dict=True)


@frappe.whitelist()
def drill(payload, scope="My", filters=None):
    payload = frappe.parse_json(payload) if isinstance(payload, str) else (payload or {})
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    filters = frappe._dict(filters); filters["scope"] = scope
    su = _resolve_scope_dash(filters)
    cf, ct, _pf, _pt = _period_range(filters)
    dtype, key = payload.get("type"), payload.get("key")

    # Activity drills hit other doctypes, not Opportunity:
    if dtype == "activity":
        return _activity_drill(su, cf, ct, key)
    if dtype == "quotes":
        return _quotes_drill(su)
    if dtype == "renewals":
        return _renewals_drill(su, key)

    # Opportunity-based drills: load rows, then filter by the clicked key
    rows = _dash_heads(filters, su, cf, ct)
    if dtype == "stage":
        rows = [r for r in rows if (r.sales_stage or "(none)") == key]
        title = _("Stage: {0}").format(key)
    elif dtype == "status":
        rows = [r for r in rows if r.status == key]
        title = _("Status: {0}").format(key)
    elif dtype == "rep":
        rows = [r for r in rows if r.sp == key]
        title = _("Sales person: {0}").format(key)
    elif dtype == "stalled":
        cutoff = add_to_date(getdate(nowdate()), days=-14)
        rows = [r for r in rows if r.status in OPEN_STATUSES and r.get("modified")
                and getdate(r.modified) < cutoff and (r.sales_stage or "(none)") == key]
        title = _("Stalled: {0}").format(key)
    elif dtype == "lost":
        rows = _lost_reason_opps(filters, su, cf, ct, key)   # see note below
        title = _("Lost — {0}").format(key)
    else:
        title = _("Detail")

    return {"title": title, "count": len(rows), "blocks": [_opp_table(rows)]}


def _opp_table(rows):
    return {"type": "table", "w": "wide", "title": _("Opportunities"),
            "columns": [_("Opportunity"), _("Customer"), _("Stage"), _("Status"), _("Amount")],
            "rows": [[
                {"v": r.name, "link": f"/app/opportunity/{r.name}", "bold": True},
                {"v": r.customer or "-"},
                {"v": r.sales_stage or "-"},
                {"v": r.status or "-"},
                {"v": flt(r.amount), "money": True, "bold": True},
            ] for r in rows[:200]]}





def _quotes_drill(su):
    cond, p = ["q.status='Open'"], {}
    if su is not None:
        cond.append("q.owner in %(u)s"); p["u"] = tuple(su or ["__none__"])
    rows = frappe.db.sql(f"""select q.name, q.party_name, q.grand_total, q.transaction_date
        from `tabQuotation` q where {' and '.join(cond)} order by q.transaction_date desc limit 200""",
        p, as_dict=True)
    return {"title": _("Quotes outstanding"), "count": len(rows),
            "blocks": [{"type": "table", "w": "wide", "title": _("Quotations"),
                "columns": [_("Quotation"), _("Customer"), _("Total"), _("Date")],
                "rows": [[{"v": r.name, "link": f"/app/quotation/{r.name}", "bold": True},
                          {"v": r.party_name or "-"}, {"v": flt(r.grand_total), "money": True},
                          {"v": str(r.transaction_date or "-"), "muted": True}] for r in rows]}]}


# @frappe.whitelist()
# def overview_drill(metric, scope="My", filters=None):
#     filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
#     filters = frappe._dict(filters)
#     filters["scope"] = scope
#     su = _resolve_scope_dash(filters)
#     cf, ct, _pf, _pt = _period_range(filters)
#     rows = _metric_rows(_dash_heads(filters, su, cf, ct), metric)

#     titles = {"total": _("All opportunities"), "open_pipeline": _("Open pipeline"),
#               "weighted": _("Weighted pipeline"), "won_value": _("Won opportunities"),
#               "win_rate": _("Decided opportunities")}
#     money = metric in ("open_pipeline", "weighted", "won_value")
#     valfn = (lambda r: flt(r.weighted)) if metric == "weighted" else (lambda r: flt(r.amount))

#     breakdown = {"type": "hbars", "w": "half", "title": _("By stage"),
#                  "sub": _("Value") if money else _("Count"),
#                  "bars": _hbars(rows, lambda r: r.sales_stage,
#                                 valfn if money else (lambda r: 1), C["ac"], money=money)}
#     bd_status = {"type": "hbars", "w": "half", "title": _("By status"), "sub": _("Count"),
#                  "bars": _hbars(rows, lambda r: r.status, lambda r: 1, C["pu"])}

#     items = _drill_items(filters, su, cf, ct, metric)
#     fc_color = {"Include": C["ok"], "Exclude": C["dg"]}
#     table = {"type": "table", "w": "wide", "title": _("Opportunities"), "sub": titles.get(metric, ""),
#              "columns": [_("Subject / ID"), _("Customer"), _("Item"), 
#                          _("Qty"), _("Rate"), _("Amount"), _("Closing")],
#              "rows": [[
#                  {"stack": [{"t": r.subject or "-", "strong": True},
#                             {"t": r.oid, "link": f"/app/opp-list/{r.oid}", "accent": True}
#                             ]},
                
#                 {
#                     "stack": [
#                         {"t": r.customer or "-", "strong": True},   # main (Customer)
#                         {"t": r.sp or "-", "color": C["tl"]}        # below (Sales Person)
#                     ]
#                 },

#                 {
#                     "stack": [
#                         # ✅ Item Name (bold)
#                         {"t": r.item_name or "-", "strong": True},

#                         # ✅ Brand + Item Group (colored subtle line)
#                         {
#                             "t": " • ".join([x for x in [r.brand, r.item_group] if x]) or "-",
#                             "color": C["mu"]  # soft gray/blue
#                         },

#                         # ✅ Sales Stage
#                         {
#                             "t": r.sales_stage or "-",
#                             "color": C["ac"]  # blue
#                         },

#                         # ✅ Forecast
#                         {
#                             "t": r.forecast or "-",
#                             "color": {"Include": C["ok"], "Exclude": C["dg"]}.get(r.forecast, C["mu"])
#                         }
#                     ]
#                 },

                 
#                  {"v": flt(r.qty)},
#                  {"v": flt(r.rate), "money": True},
#                  {"v": flt(r.amount), "money": True, "bold": True},
#                  {"v": str(r.expected_closing) if r.expected_closing else "-", "muted": True},
#              ] for r in items]}

#     # return {"title": titles.get(metric, _("Detail")), "count": len(rows),
#     #         "blocks": [table, breakdown, bd_status]}
#     return {"title": titles.get(metric, _("Detail")), "count": len(rows),
#             "blocks": [table]}

def _drill_items_for(names):
    """Opportunity Item rows for a specific set of opportunity names (one page)."""
    if not names:
        return []
    return frappe.db.sql(f"""
        select o.name oid, o.`{SUBJECT_FIELD}` subject, o.customer_name customer,
               o.`{SALES_PERSON_FIELD}` sp, oi.sales_stage sales_stage,
               oi.`{FORECAST_FIELD}` forecast, o.expected_closing expected_closing,
               oi.item_name item_name, oi.brand brand, it.item_group item_group,
               oi.qty qty, oi.rate rate, oi.amount amount
        from `tabOpportunity` o
        join `tabOpportunity Item` oi on oi.parent = o.name
        left join `tabItem` it on it.name = oi.item_code
        where o.name in %(names)s
        order by o.transaction_date desc""", {"names": tuple(names)}, as_dict=True)


@frappe.whitelist()
def overview_drill(metric, scope="My", filters=None, page=0):
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    filters = frappe._dict(filters); filters["scope"] = scope
    su = _resolve_scope_dash(filters)
    cf, ct, _pf, _pt = _period_range(filters)
    page = cint(page)
    PAGE = 20

    all_rows = _metric_rows(_dash_heads(filters, su, cf, ct), metric)
    total = len(all_rows)
    start = page * PAGE
    page_rows = all_rows[start:start + PAGE]
    names = [r.name for r in page_rows]
    items = _drill_items_for(names) if names else []

    titles = {"total": _("All opportunities"), "open_pipeline": _("Open pipeline"),
              "weighted": _("Weighted pipeline"), "won_value": _("Won opportunities"),
              "win_rate": _("Decided opportunities")}

    table = {"type": "table", "w": "wide", "title": _("Opportunities"), "sub": titles.get(metric, ""),
             "columns": [_("Subject / ID"), _("Customer"), _("Item"),
                         _("Qty"), _("Rate"), _("Amount"), _("Closing")],
             "rows": [[
                 {"stack": [{"t": r.subject or "-", "strong": True},
                            {"t": r.oid, "link": f"/app/opp-list/{r.oid}", "accent": True}]},
                 {"stack": [{"t": r.customer or "-", "strong": True},
                            {"t": r.sp or "-", "color": C["tl"]}]},
                 {"stack": [
                     {"t": r.item_name or "-", "strong": True},
                     {"t": " • ".join([x for x in [r.brand, r.item_group] if x]) or "-", "color": C["mu"]},
                     {"t": r.sales_stage or "-", "color": C["ac"]},
                     {"t": r.forecast or "-",
                      "color": {"Include": C["ok"], "Exclude": C["dg"]}.get(r.forecast, C["mu"])},
                 ]},
                 {"v": flt(r.qty)},
                 {"v": flt(r.rate), "money": True},
                 {"v": flt(r.amount), "money": True, "bold": True},
                 {"v": str(r.expected_closing) if r.expected_closing else "-", "muted": True},
             ] for r in items]}

    return {
        "title": titles.get(metric, _("Detail")),
        "count": total,
        "shown": start + len(page_rows),
        "page": page,
        "has_more": (start + PAGE) < total,
        "list_route": _opp_list_route(metric, filters),
        "blocks": [table],
    }

def _opp_list_route(metric, filters):
    status_map = {
        "open_pipeline": OPEN_STATUSES, "weighted": OPEN_STATUSES,
        "won_value": WON_STATUSES, "win_rate": WON_STATUSES + LOST_STATUSES,
    }
    parts = []
    statuses = status_map.get(metric)
    if statuses:
        parts.append("status=" + ",".join(statuses))
    for k in ("brand", "item_category", "sales_person"):
        v = _as_list(filters.get(k))
        if v:
            parts.append(f"{k}=" + ",".join(v))
    qs = ("?" + "&".join(parts)) if parts else ""
    return f"/app/opp-list{qs}"



def _stage_color(stage):
    if not stage:
        return "#97a2bf"
    s = stage.lower()
    if "negotiation" in s:
        return "#7c3aed"
    if "proposal" in s:
        return "#0b8c78"
    if "qualification" in s:
        return "#2f4de0"
    return "#68748f"


@frappe.whitelist()
def dash_options(kind, scope="My", txt=""):
    txt = (txt or "").strip()
    like = f"%{txt}%"
    if kind == "brand":
        return frappe.db.sql("""select name value, name label from `tabBrand`
            where name like %(l)s order by name limit 50""", {"l": like}, as_dict=True)
    if kind == "item_category":
        return frappe.db.sql("""select name value, name label from `tabItem Group`
            where is_group=0 and name like %(l)s order by name limit 50""", {"l": like}, as_dict=True)
    if kind == "sales_person":
        return scope_people(scope)
    return []


def _heatmap(rows):
    months, grid = [], {d: {} for d in WEEKDAYS}
    for r in rows:
        if not r.creation:
            continue
        dt = getdate(r.creation)
        mk = str(r.creation)[:7]
        wd = WEEKDAYS[dt.weekday()]
        if mk not in months:
            months.append(mk)
        grid[wd][mk] = grid[wd].get(mk, 0) + 1
    months = sorted(months)[-6:]
    mx = max([grid[d].get(m, 0) for d in WEEKDAYS for m in months], default=1) or 1
    return {"type": "heatmap", "w": "wide", "title": _("Activity heatmap"),
            "sub": _("Opportunities created — weekday × month"),
            "cols": [m[5:] for m in months], "max": mx,
            "rows": [{"label": d, "cells": [grid[d].get(m, 0) for m in months]} for d in WEEKDAYS]}

# ===========================================================================
# Pipeline — KPIs + FUNNEL + stage donut + value bars
# ===========================================================================
def _pipeline(rows, filters, su, scope="My"):
    open_rows = [r for r in rows if r.status in OPEN_STATUSES]
    open_v = sum(flt(r.amount) for r in open_rows)
    avg = (open_v / len(open_rows)) if open_rows else 0
    stages = len({r.sales_stage for r in open_rows if r.sales_stage})

    kpis = [
        _kpi("Open opportunities", len(open_rows), "Int", "blue", "ti-folder"),
        _kpi("Open pipeline", open_v, "Currency", "amber", "ti-businessplan"),
        _kpi("Avg deal size", avg, "Currency", "purple", "ti-coin"),
        _kpi("Active stages", stages, "Int", "green", "ti-stack-2"),
    ]

    cnt = {}
    for r in open_rows:
        cnt[r.sales_stage or _("(none)")] = cnt.get(r.sales_stage or _("(none)"), 0) + 1
    ordered = _stage_sorted(list(cnt.keys()))
    first = cnt[ordered[0]] if ordered else 1
    steps, prev = [], None
    for i, s in enumerate(ordered):
        v = cnt[s]
        steps.append({"label": s, "value": v,
                      "pct": round(v / (first or 1) * 100.0, 1),
                      "dropoff": (round((prev - v) / prev * 100.0, 1) if prev else 0.0),
                      "color": PALETTE[i % len(PALETTE)]})
        prev = v
    funnel = {"type": "funnel", "w": "half", "title": _("Stage funnel"),
              "sub": _("Open opportunities — drop-off by stage"), "steps": steps}

    donut = {"type": "donut", "w": "half", "title": _("Stage mix"), "sub": _("Open deals"),
             "total": len(open_rows), "total_label": _("open"),
             "segments": [{"label": s, "value": cnt[s], "color": PALETTE[i % len(PALETTE)]}
                          for i, s in enumerate(ordered)]}
    vbars = {"type": "hbars", "w": "half", "title": _("Pipeline value by stage"), "sub": _("Open"),
             "bars": _hbars(open_rows, lambda r: r.sales_stage, lambda r: flt(r.amount), C["ac"], money=True)}

    return {"kpis": kpis, "blocks": [funnel, donut, vbars]}


# ===========================================================================
# Forecast — KPIs + weighted STACKED AREA by stage + confidence RING + table
# ===========================================================================
def _forecast(rows, filters, su, scope="My"):
    today = getdate(nowdate())
    d30 = d60 = d90 = tot = 0.0
    open_fc = [r for r in rows if r.status in OPEN_STATUSES and r.expected_closing]
    for r in open_fc:
        w = flt(r.weighted)
        tot += w
        gap = date_diff(getdate(r.expected_closing), today)
        if 0 <= gap <= 30: d30 += w
        if 0 <= gap <= 60: d60 += w
        if 0 <= gap <= 90: d90 += w

    split = _value_split(filters, su, cf, ct)
    kpis = [
        _kpi("New business (weighted)", split["new_weighted"], "Currency", "blue", "ti-plus"),
        _kpi("Renewal value (weighted)", split["renewal_weighted"], "Currency", "green", "ti-refresh"),
        _kpi("Total weighted open", split["new_weighted"] + split["renewal_weighted"], "Currency", "purple", "ti-scale"),
        _kpi("Weighted next 30d", d30, "Currency", "green", "ti-calendar-due"),
        _kpi("Next 60d", d60, "Currency", "blue", "ti-calendar"),
        _kpi("Next 90d", d90, "Currency", "amber", "ti-calendar-stats"),
        _kpi("Total weighted open", tot, "Currency", "purple", "ti-scale"),
    ]

    # weighted by stage stacked across expected_closing months
    months = sorted({_mkey(r.expected_closing) for r in open_fc})[:8]
    top_stages = [s for s, _v in sorted(
        {st: sum(flt(r.weighted) for r in open_fc if r.sales_stage == st)
         for st in {r.sales_stage for r in open_fc if r.sales_stage}}.items(),
        key=lambda kv: kv[1], reverse=True)][:5]
    series = []
    for i, st in enumerate(top_stages):
        vals = []
        for m in months:
            vals.append(sum(flt(r.weighted) for r in open_fc
                            if r.sales_stage == st and _mkey(r.expected_closing) == m))
        series.append({"name": st, "color": PALETTE[i % len(PALETTE)], "values": vals})
    area = {"type": "areastack", "w": "wide", "title": _("Weighted forecast by stage"),
            "sub": _("Stacked across closing months"), "money": True,
            "xlabels": [m[5:] for m in months], "series": series}

    avg_prob = round(sum(flt(r.probability) for r in open_fc) / len(open_fc), 1) if open_fc else 0
    ring = {"type": "gauge", "w": "third", "title": _("Forecast confidence"),
            "sub": _("Avg probability of open deals"), "value": avg_prob, "max": 100,
            "suffix": "%", "color": C["tl"], "caption": _("{0} open deals").format(len(open_fc))}

    wbars = {"type": "hbars", "w": "third", "title": _("Weighted by stage"), "sub": _("Open"),
             "bars": _hbars(open_fc, lambda r: r.sales_stage, lambda r: flt(r.weighted), C["pu"], money=True)}

    sp = {"type": "hbars", "w": "third", "title": _("Weighted by rep"), "sub": _("Open"),
          "bars": _hbars(open_fc, lambda r: r.sp, lambda r: flt(r.weighted), C["ac"], money=True)}

    upcoming = sorted(open_fc, key=lambda r: getdate(r.expected_closing))[:12]
    table = {"type": "table", "w": "wide", "title": _("Upcoming closings"), "sub": _("Soonest open deals"),
             "columns": [_("Opportunity"), _("Customer"), _("Stage"), _("Expected"), _("Amount"), _("Weighted")],
             "rows": [[
                 {"v": r.name, "link": f"/app/opportunity/{r.name}"},
                 {"v": r.customer or "-"}, {"v": r.sales_stage or "-"},
                 {"v": str(r.expected_closing), "muted": True},
                 {"v": flt(r.amount), "money": True},
                 {"v": flt(r.weighted), "money": True, "bold": True},
             ] for r in upcoming]}

    return {"kpis": kpis, "blocks": [area, ring, wbars, sp, table]}


# ===========================================================================
# Sales Person — KPIs + scorecard with SPARKLINES + value bars
# ===========================================================================
def _salesperson(rows, filters, su, scope="My"):
    months_all = sorted({_mkey(r.creation) for r in rows if r.creation})[-6:]
    agg = {}
    for r in rows:
        k = r.sp or _("Unassigned")
        a = agg.setdefault(k, {"name": k, "open": 0, "won": 0, "lost": 0,
                               "weighted": 0.0, "won_value": 0.0,
                               "spark": {m: 0 for m in months_all}})
        if r.status in OPEN_STATUSES:
            a["open"] += 1
            a["weighted"] += flt(r.weighted)
        if r.status in WON_STATUSES:
            a["won"] += 1
            a["won_value"] += flt(r.amount)
            mk = _mkey(r.creation)
            if mk in a["spark"]:
                a["spark"][mk] += 1
        if r.status in LOST_STATUSES:
            a["lost"] += 1
    people = list(agg.values())
    for a in people:
        a["win_rate"] = _win_rate(a["won"], a["lost"])
    people.sort(key=lambda x: x["won_value"], reverse=True)
    team_won = sum(a["won"] for a in people)
    team_lost = sum(a["lost"] for a in people)

    is_my = (scope == "My")
    if is_my:
        me = people[0] if people else {"won_value": 0, "weighted": 0, "open": 0, "won": 0, "lost": 0, "win_rate": 0}
        kpis = [
            _kpi("My open", me["open"], "Int", "blue", "ti-folder"),
            _kpi("My won value", me["won_value"], "Currency", "green", "ti-trophy"),
            _kpi("My weighted", me["weighted"], "Currency", "amber", "ti-scale"),
            _kpi("My win rate", me["win_rate"], "Percent", "purple", "ti-target-arrow"),
        ]
    else:
        kpis = [
            _kpi("Sales people", len(people), "Int", "blue", "ti-users"),
            _kpi("Team won value", sum(a["won_value"] for a in people), "Currency", "green", "ti-trophy"),
            _kpi("Team weighted", sum(a["weighted"] for a in people), "Currency", "amber", "ti-scale"),
            _kpi("Team win rate", _win_rate(team_won, team_lost), "Percent", "purple", "ti-target-arrow"),
        ]

    table = {"type": "table", "w": "wide",
             "title": _("My performance") if is_my else _("Sales person scorecard"),
             "sub": _("Your monthly trend") if is_my else _("Ranked by won value"),
             "columns": [_("Sales person"), _("Trend"), _("Open"), _("Won"), _("Lost"),
                         _("Win rate"), _("Weighted"), _("Won value")],
             "rows": [[
                 {"v": a["name"], "avatar": True},
                 {"spark": [a["spark"][m] for m in months_all], "color": C["ac"]},
                 {"v": a["open"]},
                 {"v": a["won"], "color": C["ok"]},
                 {"v": a["lost"], "color": C["dg"]},
                 {"v": a["win_rate"], "pct": True, "bar": round(a["win_rate"], 0)},
                 {"v": a["weighted"], "money": True},
                 {"v": a["won_value"], "money": True, "bold": True},
             ] for a in (people[:1] if is_my else people[:15])]}

    if is_my:
        # self-only: stage breakdowns instead of cross-rep comparison
        won_block = {"type": "hbars", "w": "half", "title": _("My won by stage"), "sub": _("Closed won"),
                     "bars": _hbars([r for r in rows if r.status in WON_STATUSES],
                                    lambda r: r.sales_stage, lambda r: flt(r.amount), C["ok"], money=True)}
        wtd_block = {"type": "hbars", "w": "half", "title": _("My weighted by stage"), "sub": _("Open"),
                     "bars": _hbars([r for r in rows if r.status in OPEN_STATUSES],
                                    lambda r: r.sales_stage, lambda r: flt(r.weighted), C["ac"], money=True)}
    else:
        won_block = {"type": "hbars", "w": "half", "title": _("Won value by rep"), "sub": _("Top 8"),
                     "bars": _hbars(rows, lambda r: r.sp if r.status in WON_STATUSES else None,
                                    lambda r: flt(r.amount) if r.status in WON_STATUSES else 0,
                                    C["ok"], money=True, limit=8)}
        wtd_block = {"type": "hbars", "w": "half", "title": _("Weighted pipeline by rep"), "sub": _("Top 8"),
                     "bars": _hbars([r for r in rows if r.status in OPEN_STATUSES],
                                    lambda r: r.sp, lambda r: flt(r.weighted), C["ac"], money=True, limit=8)}

    return {"kpis": kpis, "blocks": [table, won_block, wtd_block]}


# ===========================================================================
# Conversion — KPIs + TWO FUNNELS (stage + status) + trend + source
# ===========================================================================
def _conversion(rows, filters, su, scope="My"):
    created = len(rows)
    won = sum(1 for r in rows if r.status in WON_STATUSES)
    lost = sum(1 for r in rows if r.status in LOST_STATUSES)
    open_cnt = sum(1 for r in rows if r.status in OPEN_STATUSES)
    conv = round(won / created * 100.0, 1) if created else 0.0

    kpis = [
        _kpi("Created", created, "Int", "blue", "ti-plus"),
        _kpi("Converted", won, "Int", "green", "ti-check"),
        _kpi("Conversion rate", conv, "Percent", "purple", "ti-trending-up"),
        _kpi("Lost", lost, "Int", "red", "ti-x"),
    ]

    # stage funnel
    cnt = {}
    for r in rows:
        cnt[r.sales_stage or _("(none)")] = cnt.get(r.sales_stage or _("(none)"), 0) + 1
    ordered = _stage_sorted(list(cnt.keys()))
    first = cnt[ordered[0]] if ordered else 1
    stage_steps, prev = [], None
    for i, s in enumerate(ordered):
        v = cnt[s]
        stage_steps.append({"label": s, "value": v, "pct": round(v / (first or 1) * 100.0, 1),
                            "dropoff": (round((prev - v) / prev * 100.0, 1) if prev else 0.0),
                            "color": PALETTE[i % len(PALETTE)]})
        prev = v
    stage_funnel = {"type": "funnel", "w": "half", "title": _("Stage funnel"), "sub": _("By sales stage"), "steps": stage_steps}

    # status funnel: Open -> Quotation -> Replied -> Converted
    flow = [("Open", C["ac"]), ("Quotation", C["am"]), ("Replied", C["sk"]), ("Converted", C["ok"])]
    scnt = {}
    for r in rows:
        scnt[r.status] = scnt.get(r.status, 0) + 1
    sfirst = scnt.get("Open", created) or created or 1
    status_steps, prev = [], None
    for lbl, col in flow:
        v = scnt.get(lbl, 0)
        status_steps.append({"label": lbl, "value": v, "pct": round(v / (sfirst or 1) * 100.0, 1),
                             "dropoff": (round((prev - v) / prev * 100.0, 1) if prev and prev else 0.0),
                             "color": col})
        prev = v
    status_funnel = {"type": "funnel", "w": "half", "title": _("Status funnel"), "sub": _("By status flow"), "steps": status_steps}

    mk, cre, wonm = _monthly_cw(rows)
    trend = {"type": "trend", "w": "wide", "title": _("Created vs converted"), "sub": _("Monthly"),
             "xlabels": [m[5:] for m in mk],
             "series": [{"name": _("Created"), "color": C["ac"], "values": cre},
                        {"name": _("Converted"), "color": C["ok"], "values": wonm}]}

    if _has(SOURCE_FIELD):
        where, p = _base(filters, su)
        srows = frappe.db.sql(f"""
            select coalesce(o.`{SOURCE_FIELD}`,'(none)') k, count(*) cnt,
                   sum(case when o.status in %(won)s then 1 else 0 end) won
            from `tabOpportunity` o where {where} group by k order by cnt desc limit 8""",
            {**p, "won": WON_STATUSES}, as_dict=True)
        mx = max([cint(s.cnt) for s in srows], default=1) or 1
        bars = [{"label": f"{s.k} ({round(cint(s.won)/cint(s.cnt)*100.0,1) if s.cnt else 0}%)",
                 "value": cint(s.cnt), "color": C["tl"], "pct": round(cint(s.cnt)/mx*100, 1)} for s in srows]
        src = {"type": "hbars", "w": "wide", "title": _("Volume & conversion by source"), "sub": _("Count (win %)"), "bars": bars}
    else:
        src = {"type": "hbars", "w": "wide", "title": _("Volume by stage"), "sub": _("Count"),
               "bars": _hbars(rows, lambda r: r.sales_stage, lambda r: 1, C["tl"])}

    return {"kpis": kpis, "blocks": [stage_funnel, status_funnel, trend, src]}


# ===========================================================================
# Teams (Organization only) — rep -> team rollup
#   Primary: the rep's manager via Employee.reports_to
#   Secondary: Sales Person set on the user's User Permissions
# ===========================================================================
def _team_of_user(user, _cache):
    """Resolve a display 'team' for a given user id, with caching."""
    if user in _cache:
        return _cache[user]
    team = None
    # 1) Employee reports_to -> manager's name
    emp = frappe.db.get_value("Employee", {"user_id": user},
                              ["name", "reports_to"], as_dict=True)
    if emp and emp.reports_to:
        team = frappe.db.get_value("Employee", emp.reports_to, "employee_name") or emp.reports_to
    # 2) fall back to Sales Person from User Permission
    if not team:
        sp = frappe.db.get_value("User Permission",
                                 {"user": user, "allow": "Sales Person"}, "for_value")
        if sp:
            # parent sales person (team) if it sits in a tree, else itself
            parent = frappe.db.get_value("Sales Person", sp, "parent_sales_person")
            team = parent or sp
    team = team or _("Unassigned")
    _cache[user] = team
    return team


def _teams(rows, filters, su, scope="Organization"):
    cache = {}
    agg = {}
    for r in rows:
        t = _team_of_user(r.sp, cache) if r.sp else _("Unassigned")
        a = agg.setdefault(t, {"team": t, "reps": set(), "open": 0, "won": 0, "lost": 0,
                               "open_value": 0.0, "weighted": 0.0, "won_value": 0.0})
        if r.sp:
            a["reps"].add(r.sp)
        if r.status in OPEN_STATUSES:
            a["open"] += 1
            a["open_value"] += flt(r.amount)
            a["weighted"] += flt(r.weighted)
        if r.status in WON_STATUSES:
            a["won"] += 1
            a["won_value"] += flt(r.amount)
        if r.status in LOST_STATUSES:
            a["lost"] += 1
    teams = list(agg.values())
    for a in teams:
        a["rep_count"] = len(a["reps"])
        a["win_rate"] = _win_rate(a["won"], a["lost"])
    teams.sort(key=lambda x: x["won_value"], reverse=True)

    kpis = [
        _kpi("Teams", len(teams), "Int", "blue", "ti-building-community"),
        _kpi("Org won value", sum(a["won_value"] for a in teams), "Currency", "green", "ti-trophy"),
        _kpi("Org weighted", sum(a["weighted"] for a in teams), "Currency", "amber", "ti-scale"),
        _kpi("Org win rate",
             _win_rate(sum(a["won"] for a in teams), sum(a["lost"] for a in teams)),
             "Percent", "purple", "ti-target-arrow"),
    ]

    table = {"type": "table", "w": "wide", "title": _("Team rollup"), "sub": _("By manager / sales team"),
             "columns": [_("Team"), _("Reps"), _("Open"), _("Won"), _("Lost"),
                         _("Win rate"), _("Open pipeline"), _("Won value")],
             "rows": [[
                 {"v": a["team"], "avatar": True},
                 {"v": a["rep_count"]},
                 {"v": a["open"]},
                 {"v": a["won"], "color": C["ok"]},
                 {"v": a["lost"], "color": C["dg"]},
                 {"v": a["win_rate"], "pct": True, "bar": round(a["win_rate"], 0)},
                 {"v": a["open_value"], "money": True},
                 {"v": a["won_value"], "money": True, "bold": True},
             ] for a in teams]}

    mxw = teams[0]["won_value"] if teams else 1
    won_block = {"type": "hbars", "w": "half", "title": _("Won value by team"), "sub": _("Org-wide"),
                 "bars": [{"label": a["team"], "value": a["won_value"], "color": C["ok"],
                           "pct": round(a["won_value"] / (mxw or 1) * 100, 1), "money": True}
                          for a in teams[:8]]}
    mxp = max([a["open_value"] for a in teams], default=1) or 1
    pipe_block = {"type": "hbars", "w": "half", "title": _("Open pipeline by team"), "sub": _("Org-wide"),
                  "bars": [{"label": a["team"], "value": a["open_value"], "color": C["ac"],
                            "pct": round(a["open_value"] / mxp * 100, 1), "money": True}
                           for a in sorted(teams, key=lambda x: x["open_value"], reverse=True)[:8]]}

    return {"kpis": kpis, "blocks": [table, won_block, pipe_block]}


# def _overview(rows, filters, su, scope="My"):
    # cf, ct, pf, pt = _period_range(filters)
    # cur = _dash_heads(filters, su, cf, ct)
    # prev = _dash_heads(filters, su, pf, pt) if pf else None

    # def card(label, metric, datatype, ind, icon):
    #     v = _metric_value(cur, metric)
    #     c = _kpi(label, v, datatype, ind, icon)
    #     c["metric"] = metric
    #     keys, created, wonm = _monthly_cw(cur)
    #     c["spark"] = created if metric == "total" else wonm
    #     d = _delta(v, _metric_value(prev, metric)) if prev else None
    #     if d:
    #         c["delta"] = d
    #     return c

    # pre = {"My": _("My"), "My Team": _("Team"), "Organization": _("Org")}.get(scope, "")
    # kpis = [
    #     card(f"{pre} opportunities".strip(), "total", "Int", "blue", "ti-briefcase"),
    #     card("Open pipeline", "open_pipeline", "Currency", "amber", "ti-businessplan"),
    #     card("Weighted pipeline", "weighted", "Currency", "blue", "ti-scale"),
    #     card("Won value", "won_value", "Currency", "green", "ti-trophy"),
    #     card("Win rate", "win_rate", "Percent", "purple", "ti-target-arrow"),
    # ]

    # total = len(cur)
    # mk, cre, wonm = _monthly_cw(cur)
    # trend = {"type": "trend", "w": "wide", "title": _("Opportunity trend"), "sub": _("Created vs won — monthly"),
    #          "xlabels": [m[5:] for m in mk],
    #          "series": [{"name": _("Created"), "color": C["ac"], "values": cre},
    #                     {"name": _("Won"), "color": C["ok"], "values": wonm}]}

    # st = {}
    # for r in cur:
    #     st[r.status or _("Unknown")] = st.get(r.status or _("Unknown"), 0) + 1
    # sc = {"Open": C["ac"], "Quotation": C["am"], "Converted": C["ok"], "Lost": C["dg"], "Replied": C["mu"], "Closed": C["tl"]}
    # donut = {"type": "donut", "w": "half", "title": _("By status"), "sub": _("Distribution"),
    #          "total": total, "total_label": _("opps"),
    #          "segments": [{"label": k, "value": v, "color": sc.get(k, C["mu"])}
    #                       for k, v in sorted(st.items(), key=lambda kv: kv[1], reverse=True)]}

    # if scope == "My":
    #     side = {"type": "hbars", "w": "half", "title": _("My pipeline by stage"), "sub": _("Open value"),
    #             "bars": _hbars([r for r in cur if r.status in OPEN_STATUSES],
    #                            lambda r: r.sales_stage, lambda r: flt(r.amount), C["tl"], money=True)}
    # else:
    #     side = {"type": "hbars", "w": "half", "title": _("By sales person"), "sub": _("Pipeline value"),
    #             "bars": _hbars(cur, lambda r: r.sp, lambda r: flt(r.amount), C["tl"], money=True)}

    # heat = _heatmap(cur)

    # # --- Sales stage funnel (SVG style: gradient bands, count, drop-off, optional Tgt line) ---
    # open_rows = [r for r in cur if r.status in OPEN_STATUSES]
    # stg_val, stg_cnt = {}, {}
    # for r in open_rows:
    #     k = r.sales_stage or _("(none)")
    #     stg_val[k] = stg_val.get(k, 0) + flt(r.amount)
    #     stg_cnt[k] = stg_cnt.get(k, 0) + 1
    # ordered = sorted(stg_val.keys(), key=lambda s: stg_val[s], reverse=True)
    # top_v = stg_val[ordered[0]] if ordered else 1
    # steps, prev_v = [], None
    # for i, s in enumerate(ordered):
    #     v = stg_val[s]
    #     step = {"label": s, "value": v, "money": True, "count": stg_cnt[s],
    #             "pct": round((v / top_v * 100.0) if top_v else 0, 1),
    #             "dropoff": (round((prev_v - v) / prev_v * 100.0, 1) if prev_v else 0.0),
    #             "color": PALETTE[i % len(PALETTE)]}
    #     # Optional dashed Tgt line — pass an absolute ₹ amount when you have targets:
    #     # tgt = _stage_target(s, scope, filters)
    #     # if tgt: step["target"] = tgt
    #     steps.append(step)
    #     prev_v = v
    # funnel = {"type": "funnel_svg", "w": "wide", "title": _("Sales stage funnel"),
    #           "sub": _("Open pipeline value · dashed line = stage target"), "steps": steps}

    # return {"kpis": kpis, "blocks": [funnel, trend, donut, side, heat]}




def _followups(su, cf, ct, only_pending=True):
    users = (su if su is not None else _all_owner_users()) or ["__none__"]
    today = getdate(nowdate())
    items = []

    # Calls — upcoming/logged
    calls = frappe.db.sql(
        """select name, owner, creation dt from `tabCall List`
           where owner in %(u)s order by creation desc limit 50""",
        {"u": tuple(users)}, as_dict=True)
    for c in calls:
        items.append({"type": "call", "icon": "ti-phone", "title": c.name,
                      "who": c.owner, "when": c.dt, "route": "call-list", "name": c.name})

    # Appointments — participant or owner
    appts = frappe.db.sql(
        f"""select distinct a.name, a.owner, a.creation dt from `tabAppointment` a
            where {_owner_or_participant('a','Appointment',APPT_CHILD_DT,APPT_CHILD_USERFIELD)}
            order by a.creation desc limit 50""", {"u": tuple(users)}, as_dict=True)
    for a in appts:
        items.append({"type": "appointment", "icon": "ti-calendar-event", "title": a.name,
                      "who": a.owner, "when": a.dt, "route": "appointment", "name": a.name})

    # Tasks — open, with due date
    tasks = frappe.db.sql(
        f"""select distinct t.name, t.subject, t.status, t.exp_end_date due, t.modified dt from `tabTask` t
            where {_owner_or_participant('t','Task',TASK_CHILD_DT,TASK_CHILD_USERFIELD)}
              and t.status not in ('Completed','Cancelled')
            order by t.modified desc limit 50""", {"u": tuple(users)}, as_dict=True)
    for t in tasks:
        items.append({"type": "task", "icon": "ti-checkbox", "title": t.subject or t.name,
                      "who": None, "when": t.due or t.dt, "route": "task", "name": t.name,
                      "status": t.status, "overdue": bool(t.due and getdate(t.due) < today)})

    # sort: overdue first, then soonest
    items.sort(key=lambda x: (not x.get("overdue"), str(x.get("when") or "9999")))

    return {"type": "followups", "w": "wide", "title": _("Follow-ups"),
            "sub": _("Calls, appointments & tasks needing action"),
            "rows": [{
                "icon": it["icon"], "type": it["type"], "title": it["title"],
                "when": str(it["when"])[:16] if it["when"] else "-",
                "overdue": it.get("overdue", False),
                "status": it.get("status"),
                "link": f"/app/{it['route']}/{it['name']}",
            } for it in items[:25]]}


@frappe.whitelist()
def get_followups(scope="My", filters=None):
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    filters = frappe._dict(filters); filters["scope"] = scope
    su = _resolve_scope_dash(filters)
    today = getdate(nowdate())

    items = _collect_followups(su)     # [{type, icon, title, who, due, link, overdue}, ...]

    overdue = [i for i in items if i["due"] and getdate(i["due"]) < today]
    todays  = [i for i in items if i["due"] and getdate(i["due"]) == today]
    upcoming= [i for i in items if i["due"] and getdate(i["due"]) > today]

    return {
        "summary": {"overdue": len(overdue), "today": len(todays), "upcoming": len(upcoming)},
        "groups": [
            {"key": "overdue",  "label": _("Overdue"),  "danger": True,  "rows": _fu_rows(overdue)},
            {"key": "today",    "label": _("Today"),                     "rows": _fu_rows(todays)},
            {"key": "upcoming", "label": _("Upcoming"),                  "rows": _fu_rows(upcoming[:50])},
        ],
    }


# Date field that means "due / scheduled" for each source
CALL_DUE = "coalesce(rescheduled_date, start_date)"   # Call List
APPT_DUE = "scheduled_time"                            # Appointment
TASK_DUE = "exp_end_date"                              # Task


def _collect_followups(su):
    users = (su if su is not None else _all_owner_users()) or ["__none__"]
    today = getdate(nowdate())
    items = []

    # --- Calls (owner) ---
    for c in frappe.db.sql(
        f"""select name, owner, {CALL_DUE} due from `tabCall List`
            where owner in %(u)s and {CALL_DUE} is not null
            order by due asc limit 100""", {"u": tuple(users)}, as_dict=True):
        items.append({"type": "call", "icon": "ti-phone", "title": c.name,
                      "due": c.due, "link": f"/app/call-list/{c.name}", "status": None})

    # --- Appointments (owner or participant) ---
    for a in frappe.db.sql(
        f"""select distinct a.name, a.owner, a.{APPT_DUE} due from `tabAppointment` a
            where {_owner_or_participant('a','Appointment',APPT_CHILD_DT,APPT_CHILD_USERFIELD)}
              and a.{APPT_DUE} is not null
            order by a.{APPT_DUE} asc limit 100""", {"u": tuple(users)}, as_dict=True):
        items.append({"type": "appointment", "icon": "ti-calendar-event", "title": a.name,
                      "due": a.due, "link": f"/app/appointment/{a.name}", "status": None})

    # --- Tasks (owner or assigned-user), still open ---
    for t in frappe.db.sql(
        f"""select distinct t.name, t.subject, t.status, t.{TASK_DUE} due from `tabTask` t
            where {_owner_or_participant('t','Task',TASK_CHILD_DT,TASK_CHILD_USERFIELD)}
              and t.status not in ('Completed','Cancelled')
              and t.{TASK_DUE} is not null
            order by t.{TASK_DUE} asc limit 100""", {"u": tuple(users)}, as_dict=True):
        items.append({"type": "task", "icon": "ti-checkbox", "title": t.subject or t.name,
                      "due": t.due, "link": f"/app/task/{t.name}", "status": t.status})

    for it in items:
        it["overdue"] = bool(it["due"] and getdate(it["due"]) < today)
    return items


def _fu_rows(items):
    return [{
        "type": it["type"], "icon": it["icon"], "title": it["title"],
        "when": str(it["due"])[:16] if it["due"] else "-",
        "status": it.get("status"), "link": it["link"], "overdue": it.get("overdue", False),
    } for it in items]



# values that count as renewal/additional vs new (CONFIRM spelling from query above)
RENEWAL_TYPES = ("Renewal", "Additional")
NEW_TYPES     = ("New",)


def _value_split(filters, su, df, dt):
    """Sum Opportunity Item amount split by new vs renewal, for open deals, bucketed by closing date."""
    cond, p = ["o.status in %(open)s"], {"open": tuple(OPEN_STATUSES)}
    if df: cond.append("o.transaction_date >= %(df)s"); p["df"] = df
    if dt: cond.append("o.transaction_date <= %(dt)s"); p["dt"] = dt
    if su is not None:
        if not su: cond.append("1=0")
        else: cond.append(f"o.`{SALES_PERSON_FIELD}` in %(su)s"); p["su"] = tuple(su)
    rows = frappe.db.sql(f"""
        select oi.opportunity_type otype, oi.amount amount,
               o.expected_closing closing, o.probability prob
        from `tabOpportunity Item` oi
        join `tabOpportunity` o on o.name = oi.parent
        where {' and '.join(cond)}""", p, as_dict=True)
    new_v = renew_v = new_w = renew_w = 0.0
    for r in rows:
        amt = flt(r.amount); w = amt * flt(r.prob) / 100.0
        if (r.otype or "") in RENEWAL_TYPES:
            renew_v += amt; renew_w += w
        else:
            new_v += amt; new_w += w
    return {"new_value": new_v, "renewal_value": renew_v,
            "new_weighted": new_w, "renewal_weighted": renew_w, "rows": rows}

RENEWAL_TYPES = ("Renewal", "Additional")   # <-- CONFIRM exact spelling


def _newrenew_split(filters, su, df, dt):
    """Weighted-open value split into New vs Renewal/Additional, from Opportunity Item."""
    cond, p = ["o.status in %(open)s"], {"open": tuple(OPEN_STATUSES)}
    if df: cond.append("o.transaction_date >= %(df)s"); p["df"] = df
    if dt: cond.append("o.transaction_date <= %(dt)s"); p["dt"] = dt
    if su is not None:
        if not su: cond.append("1=0")
        else: cond.append(f"o.`{SALES_PERSON_FIELD}` in %(su)s"); p["su"] = tuple(su)
    rows = frappe.db.sql(f"""
        select oi.opportunity_type otype, oi.amount amount, o.probability prob
        from `tabOpportunity Item` oi
        join `tabOpportunity` o on o.name = oi.parent
        where {' and '.join(cond)}""", p, as_dict=True)
    new_w = renew_w = 0.0
    for r in rows:
        w = flt(r.amount) * flt(r.prob) / 100.0
        if (r.otype or "") in RENEWAL_TYPES:
            renew_w += w
        else:
            new_w += w
    return new_w, renew_w



def _brand_itemgroup_donuts(filters, su, df, dt):
    """Two distributions from Opportunity Item: by brand, by item group."""
    cond, p = ["o.status in %(open)s"], {"open": tuple(OPEN_STATUSES)}
    if df: cond.append("o.transaction_date >= %(df)s"); p["df"] = df
    if dt: cond.append("o.transaction_date <= %(dt)s"); p["dt"] = dt
    if su is not None:
        if not su: cond.append("1=0")
        else: cond.append(f"o.`{SALES_PERSON_FIELD}` in %(su)s"); p["su"] = tuple(su)
    rows = frappe.db.sql(f"""
        select oi.brand brand, it.item_group igroup, oi.amount amount
        from `tabOpportunity Item` oi
        join `tabOpportunity` o on o.name = oi.parent
        left join `tabItem` it on it.name = oi.item_code
        where {' and '.join(cond)}""", p, as_dict=True)

    bagg, gagg = {}, {}
    for r in rows:
        bagg[r.brand or _("(none)")] = bagg.get(r.brand or _("(none)"), 0) + flt(r.amount)
        gagg[r.igroup or _("(none)")] = gagg.get(r.igroup or _("(none)"), 0) + flt(r.amount)

    def segs(agg, limit=6):
        items = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)
        top = items[:limit]
        rest = sum(v for _k, v in items[limit:])
        out = [{"label": k, "value": v, "color": PALETTE[i % len(PALETTE)]}
               for i, (k, v) in enumerate(top)]
        if rest:
            out.append({"label": _("Others"), "value": rest, "color": C["mu"]})
        return out

    return segs(bagg), segs(gagg)






RENEWAL_DT      = "Renewal List"
RENEWAL_DUE     = "end_date"
RENEWAL_AMT     = "total_amount"
RENEWAL_SP      = "sales_user"
RENEWAL_PENDING = ("Active", "Cofed")   # still needs renewing
RENEWAL_SP = "renewal_owner"


def _empty_buckets():
    return [{"label": _("Expired"), "value": 0}, {"label": _("30 days"), "value": 0},
            {"label": _("60 days"), "value": 0}, {"label": _("90 days"), "value": 0}]


def _renewals_data(su):
    today = getdate(nowdate())
    cond = [f"`{RENEWAL_DUE}` is not null", "status in %(pend)s"]
    p = {"pend": tuple(RENEWAL_PENDING)}
    if su is not None:
        if not su:
            return {"buckets": _empty_buckets(), "flag": ""}
        cond.append(f"`{RENEWAL_SP}` in %(su)s"); p["su"] = tuple(su)

    rows = frappe.db.sql(f"""select `{RENEWAL_DUE}` due, `{RENEWAL_AMT}` amt
        from `tab{RENEWAL_DT}` where {' and '.join(cond)}""", p, as_dict=True)

    expired = b30 = b60 = b90 = 0
    exp_v = 0.0
    for r in rows:
        if not r.due:
            continue
        gap = date_diff(getdate(r.due), today)
        if gap < 0:
            expired += 1; exp_v += flt(r.amt)
        else:
            if gap <= 30: b30 += 1
            if gap <= 60: b60 += 1
            if gap <= 90: b90 += 1

    flag = _("{0} expired · {1} at risk").format(expired, _money(exp_v)) if expired else ""
    return {"buckets": [
                {"label": _("Expired"), "value": expired, "danger": True},
                {"label": _("30 days"), "value": b30},
                {"label": _("60 days"), "value": b60},
                {"label": _("90 days"), "value": b90}],
            "flag": flag}


def _renewals_drill(su, key):
    today = getdate(nowdate())
    if str(key) == "expired":
        cond = [f"r.`{RENEWAL_DUE}` < %(t)s", "r.status in %(pend)s"]
        p = {"t": today, "pend": tuple(RENEWAL_PENDING)}
        title = _("Expired renewals")
    else:
        days = {"30": 30, "60": 60, "90": 90}.get(str(key), 90)
        cond = [f"r.`{RENEWAL_DUE}` between %(t)s and %(end)s", "r.status in %(pend)s"]
        p = {"t": today, "end": add_to_date(today, days=days), "pend": tuple(RENEWAL_PENDING)}
        title = _("Renewals due in {0} days").format(days)

    if su is not None:
        if not su:
            return {"title": title, "count": 0,
                    "blocks": [{"type": "table", "w": "wide", "title": _("Renewals"),
                                "columns": [_("Renewal")], "rows": []}]}
        cond.append(f"r.`{RENEWAL_SP}` in %(su)s"); p["su"] = tuple(su)

    rows = frappe.db.sql(f"""
        select r.name, r.customer_name customer, r.product_name product,
               r.`{RENEWAL_SP}` sp, r.start_date start_date, r.`{RENEWAL_DUE}` due,
               r.`{RENEWAL_AMT}` amt, r.status status
        from `tab{RENEWAL_DT}` r where {' and '.join(cond)}
        order by r.`{RENEWAL_DUE}` asc limit 200""", p, as_dict=True)

    st_color = {"Active": C["ok"], "Cofed": C["ac"], "New Opp": C["pu"],
                "Draft": C["mu"], "AutoCreated": C["tl"]}

    return {"title": title, "count": len(rows),
            "blocks": [{"type": "table", "w": "wide", "title": _("Renewals"),
                "columns": [_("Customer"), _("Product"), _("Term"), _("Amount")],
                "rows": [[
                    # Col 1 — Customer (top) + Renewal ID + Status + Sales person (below), colored
                    {"stack": [
                        {"t": r.customer or "-", "strong": True},
                        {"t": r.name, "link": f"/app/renewal-list/{r.name}", "accent": True},
                        {"t": r.status or "-", "color": st_color.get(r.status, C["mu"])},
                        {"t": _name_of(r.sp) if r.sp else "-", "color": C["tl"]},
                    ]},
                    # Col 2 — Product + Brand + Item group
                    {"stack": [
                        {"t": r.product or "-", "strong": True},
                        # brand/item group added below once product source confirmed
                    ]},
                    # Col 3 — End date (colored) on top + Start date below
                    {"stack": [
                        {"t": f"{_('End')}: {r.due or '-'}", "color": C["dg"]},
                        {"t": f"{_('Start')}: {r.start_date or '-'}", "muted": True},
                    ]},
                    # Amount
                    {"v": flt(r.amt), "money": True, "bold": True},
                ] for r in rows]}]}

def _renewal_sales_names(users):
    """Map scope user-ids (emails) -> the names stored in Renewal List.sales_user."""
    if not users:
        return []
    # sales_user stores full_name; map from User.name (email) -> User.full_name
    rows = frappe.db.sql("""select full_name from `tabUser`
        where name in %(u)s and ifnull(full_name,'') != ''""",
        {"u": tuple(users)}, as_dict=True)
    return [r.full_name for r in rows] or ["__none__"]