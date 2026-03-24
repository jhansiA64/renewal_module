import frappe
from datetime import datetime
from frappe.utils import flt, now_datetime, getdate, get_datetime
#from renewal_module.custom_module.page.issue_theme.timespan import add_to_date, get_timespan_date_range
from renewal_module.test_timespan import add_to_date, get_timespan_date_range
import json
import frappe
@frappe.whitelist()
def get_customer_list(start=0, page_length=20, account_manager=None, territory=None, customer_group=None, customer_name=None, filters=None):
    import frappe, json
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters)))
    # ✅ FIX: Ensure start and page_length are properly cast
    try:
        start = int(start or 0)
        page_length = int(page_length or 20)
    except (ValueError, TypeError):
        start = 0
        page_length = 20

    conditions = []
    values = {}

    parent_doctype = "Customer"

    # --- Helper: Detect child table for a field ---
    def get_child_table_for_field(parent_doctype, fieldname):
        try:
            meta = frappe.get_meta(parent_doctype)
            for df in meta.fields:
                if df.fieldtype == "Table":
                    child_meta = frappe.get_meta(df.options)
                    if fieldname in [f.fieldname for f in child_meta.fields]:
                        return df.options
        except Exception as e:
            frappe.log_error(f"Error detecting child table for {fieldname}: {str(e)}")
        return None
    
    # Basic filters
    if account_manager:
        conditions.append("`tabCustomer`.`account_manager` = %(acc_mgr)s")
        values["acc_mgr"] = account_manager

    if territory:
        conditions.append("`tabCustomer`.`territory` = %(terr)s")
        values["terr"] = territory

    if customer_group:
        conditions.append("`tabCustomer`.`customer_group` = %(cust_grp)s")
        values["cust_grp"] = customer_group

    if customer_name:
        conditions.append("`tabCustomer`.`customer_name` LIKE %(cust_name)s")
        values["cust_name"] = f"%{customer_name}%"

    # Advanced filters
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception as e:
            frappe.log_error(f"Filter parsing error: {str(e)}")
            filters_obj = []

        for f in (filters_obj or []):
            try:
                if isinstance(f, dict):
                    field = f.get("fieldname") or f.get("field") or ""
                    operator = (f.get("operator") or "=").lower()
                    val = f.get("value")
                elif isinstance(f, (list, tuple)) and len(f) >= 3:
                    field = f[-3]
                    operator = (f[-2] or "=").lower()
                    val = f[-1]
                else:
                    continue
            except Exception as e:
                frappe.log_error(f"Filter item parsing error: {str(e)}")
                continue

            if "." in field:
                field = field.split(".")[-1]

            key = f"f_{field}_{len(values)}"

            # Detect child table dynamically
            child_table = get_child_table_for_field(parent_doctype, field)

            # Function to build condition
            def add_condition(cond_str, **kwargs):
                if child_table:
                    conditions.append(
                        f"`tabCustomer`.`name` IN ("
                        f"SELECT parent FROM `tab{child_table}` WHERE {cond_str}"
                        f")"
                    )
                else:
                    # ✅ FIX: do NOT add extra backticks
                    conditions.append(f"tabCustomer.{cond_str}")
                values.update(kwargs)


            # Operators
            try:
                if operator in ("=", "==", "equals"):
                    add_condition(f"`{field}` = %({key})s", **{key: val})
                    
                elif operator in ("!=", "<>", "not equals"):
                    add_condition(f"`{field}` != %({key})s", **{key: val})
                    
                elif operator in ("like", "contains"):
                    add_condition(f"`{field}` LIKE %({key})s", **{key: f"%{val}%"})
                    
                elif operator in ("not like", "does not contain"):
                    add_condition(f"`{field}` NOT LIKE %({key})s", **{key: f"%{val}%"})
                    
                elif operator in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
                    sql_op = {
                        ">": ">", "<": "<", ">=": ">=", "<=": "<=",
                        "after": ">", "before": "<", 
                        "on or after": ">=", "on or before": "<="
                    }.get(operator, "=")
                    add_condition(f"`{field}` {sql_op} %({key})s", **{key: val})

                elif operator == "in":
                    if isinstance(val, str):
                        val = [v.strip() for v in val.split(",") if v.strip()]
                    if isinstance(val, (list, tuple)) and val:
                        placeholders = []
                        for i, v in enumerate(val):
                            kk = f"{key}_{i}"
                            placeholders.append(f"%({kk})s")
                            values[kk] = v
                        add_condition(f"`{field}` IN ({', '.join(placeholders)})")
                        
                elif operator in ("not in", "nin"):
                    if isinstance(val, str):
                        val = [v.strip() for v in val.split(",") if v.strip()]
                    if isinstance(val, (list, tuple)) and val:
                        placeholders = []
                        for i, v in enumerate(val):
                            kk = f"{key}_{i}"
                            placeholders.append(f"%({kk})s")
                            values[kk] = v
                        add_condition(f"`{field}` NOT IN ({', '.join(placeholders)})")
                        
                elif operator == "between":
                    if isinstance(val, str) and "," in val:
                        val = [v.strip() for v in val.split(",")]
                    if isinstance(val, (list, tuple)) and len(val) == 2:
                        start_key = f"{key}_start"
                        end_key = f"{key}_end"
                        add_condition(
                            f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                            **{start_key: val[0], end_key: val[1]}
                        )
                        
                elif operator == "timespan":
                    start_date, end_date = get_timespan_date_range(val) or (None, None)
                    if start_date and end_date:
                        start_date = get_datetime(f"{start_date} 00:00:00")
                        end_date = get_datetime(f"{end_date} 23:59:59")
                        start_key = f"{key}_start"
                        end_key = f"{key}_end"
                        add_condition(
                            f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                            **{start_key: start_date, end_key: end_date}
                        )

                elif operator == "is":
                    val_lower = str(val).lower()
                    if child_table:
                        if val_lower in ("set", "not null"):
                            conditions.append(
                                f"`tabCustomer`.`name` IN ("
                                f"SELECT parent FROM `tab{child_table}` "
                                f"WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                                f")"
                            )
                        elif val_lower in ("not set", "null"):
                            conditions.append(
                                f"`tabCustomer`.`name` NOT IN ("
                                f"SELECT parent FROM `tab{child_table}` "
                                f"WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                                f")"
                            )
                    else:
                        if val_lower in ("set", "not null"):
                            conditions.append(f"`tabCustomer`.`{field}` IS NOT NULL AND `tabCustomer`.`{field}` != ''")
                        elif val_lower in ("not set", "null"):
                            conditions.append(f"(`tabCustomer`.`{field}` IS NULL OR `tabCustomer`.`{field}` = '')")

                elif operator == "fiscal year":
                    if val:
                        fy = frappe.db.get_value("Fiscal Year", val, ["year_start_date", "year_end_date"], as_dict=True)
                        if fy:
                            start_key = f"{key}_start"
                            end_key = f"{key}_end"
                            add_condition(
                                f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                                **{start_key: fy.year_start_date, end_key: fy.year_end_date}
                            )
                            
            except Exception as e:
                frappe.log_error(f"Operator processing error for {operator}: {str(e)}")
                continue

    # Build WHERE clause
    where_clause = " AND ".join(conditions) if conditions else "1=1"

    try:
        query = f"""
            SELECT
                `tabCustomer`.`name`,
                `tabCustomer`.`customer_name`,
                `tabCustomer`.`customer_group`,
                `tabCustomer`.`custom_customer_status`,
                `tabCustomer`.`territory`,
                `tabCustomer`.`industry`,
                `tabCustomer`.`account_manager`,
                `tabCustomer`.`customer_primary_contact`,
                `tabCustomer`.`mobile_no`,
                `tabCustomer`.`email_id`,
                `tabCustomer`.`image`,
                `tabCustomer`.`employees`,
                `tabCustomer`.`modified`,
                `tabCustomer`.`_comments`
            FROM `tabCustomer`
            WHERE {where_clause}
            ORDER BY `tabCustomer`.`modified` DESC
            LIMIT %(start)s, %(length)s
        """

        # ✅ FIX: Use properly validated integers
        values["start"] = start
        values["length"] = page_length

        rows = frappe.db.sql(query, values, as_dict=True)
        
        for r in rows:
            try:
                r["comment_count"] = len(json.loads(r.get("_comments") or "[]"))
            except Exception:
                r["comment_count"] = 0

        # ✅ FIX: Get accurate total count
        total_query = f"SELECT COUNT(*) FROM `tabCustomer` WHERE {where_clause}"
        total = frappe.db.sql(total_query, values)[0][0]

        return {"rows": rows, "total": int(total)}
        
    except Exception as e:
        frappe.log_error(f"Customer list query error: {str(e)}")
        frappe.throw(f"Error fetching customer list: {str(e)}")

@frappe.whitelist()
def get_customer_filters():
    # 1. Fetch Account Managers (System Users that are enabled)
    account_managers = frappe.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name", "full_name"],
        order_by="full_name asc"
    )

    # 2. Fetch Territories (full tree)
    territories = frappe.get_all(
        "Territory",
        fields=["name"],
        order_by="name asc"
    )

    # 3. Fetch Customer Groups
    customer_groups = frappe.get_all(
        "Customer Group",
        fields=["name"],
        order_by="name asc"
    )

    return {
        "account_manager": [
            {"value": u.name, "label": u.full_name or u.name}
            for u in account_managers
        ],
        "territory": [t.name for t in territories],
        "customer_group": [g.name for g in customer_groups]
    }


@frappe.whitelist()
def apply_assignment_rule(doctype, name):
    """Apply assignment rule for a document manually."""
    doc = frappe.get_doc(doctype, name)

    # Try new assignment rule engine (safe across versions)
    try:
        from frappe.automation.doctype.assignment_rule.assignment_rule import apply as apply_rule
        apply_rule(doc)
        return {"status": "success"}
    except ImportError:
        frappe.throw("Assignment rule engine not found in this Frappe version")

    return {"status": "failed"}


@frappe.whitelist()
def get_customer_details(name):
    if not frappe.has_permission("Customer", "read", name):
        frappe.throw("You do not have permission to access this customer.", frappe.PermissionError)

    customer = frappe.get_doc("Customer", name)
    # ---------------- Addresses ----------------
    address_links = frappe.get_all(
        "Dynamic Link",
        filters={
            "link_doctype": "Customer",
            "link_name": name,
            "parenttype": "Address",
        },
        fields=["parent"],
    )

    addresses = []
    if address_links:
        addresses = frappe.get_all(
            "Address",
            filters={"name": ["in", [d.parent for d in address_links]]},
            fields=["*"],
        )

    # ---------------- Contacts ----------------
    contact_links = frappe.get_all(
        "Dynamic Link",
        filters={
            "link_doctype": "Customer",
            "link_name": name,
            "parenttype": "Contact",
        },
        fields=["parent"],
    )

    contacts = []
    if contact_links:
        for cl in contact_links:
            contact = frappe.get_doc("Contact", cl.parent)

            contacts.append({
                "name": contact.name,
                "full_name": contact.full_name,
                "designation": contact.designation,
                "company_name": contact.company_name,
                "is_primary_contact": contact.is_primary_contact,
                "is_billing_contact": contact.is_billing_contact,
                "custom_linked_in": contact.custom_linked_in,
                "department": contact.department,

                "phones": [
                    {
                        "phone": p.phone,
                        "is_primary_phone": p.is_primary_phone,
                        "is_primary_mobile_no": p.is_primary_mobile_no
                    }
                    for p in contact.phone_nos
                ],
                "emails": [
                    {
                        "email_id": e.email_id,
                        "is_primary": e.is_primary
                    }
                    for e in contact.email_ids
                ]
            })

    active_renewals = []    
    active_list = frappe.db.get_list("Renewal List",filters={"customer_name":name,"status":"Active"},fields=['name'],page_length="*",order_by="end_date ASC")
    if active_list:
        for each in active_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            active_renewals.append({
                'item' : each_data.product_name,
                'quantity': each_data.total_quantity,
                'start_date':each_data.start_date,
                'end_date':each_data.end_date,
                'renewal_id':each_data.name
            }) 

    new_renewals = []
    
    new_list = frappe.db.get_list("Renewal List",filters={"customer_name":name,"status":"New Opp"},fields=['name'],page_length="*",order_by="end_date ASC")
    if new_list:
        for each in new_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            new_renewals.append({
                'item' : each_data.product_name,
                'quantity': each_data.total_quantity,
                'start_date':each_data.start_date,
                'end_date':each_data.end_date,
                'renewal_id':each_data.name
            })  

    sales_team = []
    for row in (customer.sales_team or []):
        sales_team.append({
            "name": row.name,
            "sales_person": row.sales_person,
            "team_name": getattr(row, "team_name", ""),
            "mobile_no": getattr(row, "mobile_no", ""),
            "email_id": getattr(row, "email_id", ""),
            "allocated_percentage": row.allocated_percentage
        })

    return {
        "customer_name": customer.customer_name,
        "industry": customer.industry,
        "tax_id": customer.tax_id,
        "territory": customer.territory,
        "member_of": customer.member_of,
        "email_id": customer.email_id,
        "mobile_no": customer.mobile_no,
        "customer_primary_contact": customer.customer_primary_contact,
        "customer_primary_address": customer.customer_primary_address,
        "primary_address": customer.primary_address,
        "website": customer.website,
        "custom_customer_status": customer.custom_customer_status,
        "image": customer.image,
        "addresses": addresses,
        "contacts": contacts,
        "custom_phone_number":customer.custom_phone_number,
        "custom_linked_in":customer.custom_linked_in,
        "account_manager": customer.account_manager,
        "employees": customer.employees,
        "industry": customer.industry,
        "customer_type": customer.customer_type,
        "renewals": active_renewals,
        "new_renewals": new_renewals,
        "sales_team": sales_team,
        "sales_person":customer.sales_person,
        "report_to":customer.team_name,
        "payment_terms": getattr(customer, "payment_terms", ""),
        "loyalty_program": getattr(customer, "loyalty_program", ""),
        "loyalty_program_tier": getattr(customer, "loyalty_program_tier", ""),
        "credit_limits": [
            {
                "name": row.name,
                "company": getattr(row, "company", ""),
                "credit_limit": getattr(row, "credit_limit", 0),
                "bypass_credit_limit_check": getattr(row, "bypass_credit_limit_check", 0)
            }
            for row in (getattr(customer, "credit_limits", None) or [])
        ],
        "accounts": [
            {
                "name": row.name,
                "company": getattr(row, "company", ""),
                "account": getattr(row, "account", ""),
                "account_currency": getattr(row, "account_currency", ""),
                "default_account": getattr(row, "default_account", 0)
            }
            for row in (getattr(customer, "accounts", None) or [])
        ],
        "portal_users": [
            {
                "name": row.name,
                "user": getattr(row, "user", "")
            }
            for row in (getattr(customer, "portal_users", None) or [])
        ],
        "so_required": getattr(customer, "so_required", 0),
        "dn_required": getattr(customer, "dn_required", 0),
        "is_frozen": getattr(customer, "is_frozen", 0),
        "disabled": getattr(customer, "disabled", 0)
    }


@frappe.whitelist()
def update_customer_sales_team(customer_id, sales_team):
    if not customer_id:
        frappe.throw("Customer not specified")

    if isinstance(sales_team, str):
        sales_team = json.loads(sales_team or "[]")

    if not isinstance(sales_team, (list, tuple)):
        frappe.throw("Invalid sales team data")

    customer = frappe.get_doc("Customer", customer_id)

    cleaned_rows = []
    allowed_fields = {
        "name",
        "sales_person",
        "team_name",
        "mobile_no",
        "email_id",
        "allocated_percentage"
    }
    for row in sales_team:
        if not isinstance(row, dict):
            continue
        cleaned = {field: row.get(field) for field in allowed_fields if field in row}
        cleaned_rows.append(cleaned)

    customer.set("sales_team", cleaned_rows)
    customer.save()
    frappe.db.commit()

    return {
        "sales_team": [
            {
                "name": row.name,
                "sales_person": row.sales_person,
                "team_name": getattr(row, "team_name", ""),
                "mobile_no": getattr(row, "mobile_no", ""),
                "email_id": getattr(row, "email_id", ""),
                "allocated_percentage": row.allocated_percentage
            }
            for row in (customer.sales_team or [])
        ]
    }


@frappe.whitelist()
def update_customer_settings(customer_id, settings=None):
    if not customer_id:
        frappe.throw("Customer not specified")

    if isinstance(settings, str):
        settings = json.loads(settings or "{}")

    if not isinstance(settings, dict):
        settings = {}

    customer = frappe.get_doc("Customer", customer_id)
    meta = frappe.get_meta("Customer")

    allowed_fields = ["so_required", "dn_required", "is_frozen", "disabled"]
    updated = {}
    for field in allowed_fields:
        if field in settings and meta.has_field(field):
            value = settings.get(field)
            if isinstance(value, str):
                value = 1 if value.lower() in ("1", "true", "yes") else 0
            value = 1 if value else 0
            customer.set(field, value)
            updated[field] = value

    customer.save()
    frappe.db.commit()

    response = {}
    for field in allowed_fields:
        if meta.has_field(field):
            response[field] = getattr(customer, field, 0) or 0
    return response

@frappe.whitelist()
def get_customer_permissions():
    """
    Returns boolean dictionary indicating if the current user has 
    'write' and 'delete' permissions for 'Customer' doctype.
    """
    return {
        "write": frappe.has_permission("Customer", "write"),
        "delete": frappe.has_permission("Customer", "delete"),
        "export": frappe.has_permission("Customer", "export"),
        "print": frappe.has_permission("Customer", "print")
    }

@frappe.whitelist()
def get_payment_terms_and_loyalty_options():
    """
    Fetch Payment Terms Templates and Loyalty Programs for dropdown/autocomplete
    Uses ignore_permissions to allow all users to see available options
    """
    try:
        # Fetch Payment Terms Templates
        payment_terms = frappe.get_all(
            "Payment Terms Template",
            fields=["name", "description"],
            ignore_permissions=True,
            order_by="name asc"
        )
        
        # Fetch Loyalty Programs
        loyalty_programs = frappe.get_all(
            "Loyalty Program",
            fields=["name", "title"],
            ignore_permissions=True,
            order_by="name asc"
        )
        
        return {
            "payment_terms": [{"label": p.name, "value": p.name} for p in payment_terms],
            "loyalty_programs": [{"label": l.name, "value": l.name} for l in loyalty_programs]
        }
    except Exception as e:
        frappe.log_error(str(e), "get_payment_terms_and_loyalty_options")
        return {
            "payment_terms": [],
            "loyalty_programs": []
        }


@frappe.whitelist()
def update_customer_accounts_fields(customer_id, fields=None):
    if not customer_id:
        frappe.throw("Customer not specified")

    if isinstance(fields, str):
        fields = json.loads(fields or "{}")

    if not isinstance(fields, dict):
        fields = {}

    # Check if user has read permission on Customer doctype
    if not frappe.has_permission("Customer", "read", customer_id):
        frappe.throw("You do not have permission to access this customer")

    customer = frappe.get_doc("Customer", customer_id)
    meta = frappe.get_meta("Customer")

    allowed_fields = ["payment_terms", "loyalty_program"]
    for field in allowed_fields:
        if field in fields and meta.has_field(field):
            # Use db.set_value for direct field updates to bypass permission restrictions
            # This allows non-admin users to update these specific fields
            frappe.db.set_value("Customer", customer_id, field, fields.get(field) or "")

    frappe.db.commit()

    # Fetch updated customer data
    customer = frappe.get_doc("Customer", customer_id)
    response = {
        "payment_terms": getattr(customer, "payment_terms", ""),
        "loyalty_program": getattr(customer, "loyalty_program", ""),
        "loyalty_program_tier": getattr(customer, "loyalty_program_tier", "")
    }
    return response


@frappe.whitelist()
def update_customer_credit_limits(customer_id, credit_limits=None):
    if not customer_id:
        frappe.throw("Customer not specified")

    if isinstance(credit_limits, str):
        credit_limits = json.loads(credit_limits or "[]")

    if not isinstance(credit_limits, (list, tuple)):
        frappe.throw("Invalid credit limits data")

    # Check if user has read permission on Customer doctype
    if not frappe.has_permission("Customer", "read", customer_id):
        frappe.throw("You do not have permission to access this customer")

    customer = frappe.get_doc("Customer", customer_id)
    cleaned_rows = []
    allowed_fields = {
        "name",
        "company",
        "credit_limit",
        "bypass_credit_limit_check"
    }
    for row in credit_limits:
        if not isinstance(row, dict):
            continue
        cleaned = {field: row.get(field) for field in allowed_fields if field in row}
        cleaned_rows.append(cleaned)

    customer.set("credit_limits", cleaned_rows)
    customer.save()
    frappe.db.commit()

    return [
        {
            "name": row.name,
            "company": getattr(row, "company", ""),
            "credit_limit": getattr(row, "credit_limit", 0),
            "bypass_credit_limit_check": getattr(row, "bypass_credit_limit_check", 0)
        }
        for row in (customer.credit_limits or [])
    ]


@frappe.whitelist()
def update_customer_party_accounts(customer_id, accounts=None):
    if not customer_id:
        frappe.throw("Customer not specified")

    if isinstance(accounts, str):
        accounts = json.loads(accounts or "[]")

    if not isinstance(accounts, (list, tuple)):
        frappe.throw("Invalid accounts data")

    # Check if user has read permission on Customer doctype
    if not frappe.has_permission("Customer", "read", customer_id):
        frappe.throw("You do not have permission to access this customer")

    customer = frappe.get_doc("Customer", customer_id)
    cleaned_rows = []
    allowed_fields = {
        "name",
        "company",
        "account",
        "account_currency",
        "default_account"
    }
    for row in accounts:
        if not isinstance(row, dict):
            continue
        cleaned = {field: row.get(field) for field in allowed_fields if field in row}
        cleaned_rows.append(cleaned)

    customer.set("accounts", cleaned_rows)
    customer.save()
    frappe.db.commit()

    return [
        {
            "name": row.name,
            "company": getattr(row, "company", ""),
            "account": getattr(row, "account", ""),
            "account_currency": getattr(row, "account_currency", ""),
            "default_account": getattr(row, "default_account", 0)
        }
        for row in (customer.accounts or [])
    ]


@frappe.whitelist()
def update_customer_portal_users(customer_id, portal_users=None):
    if not customer_id:
        frappe.throw("Customer not specified")

    if isinstance(portal_users, str):
        portal_users = json.loads(portal_users or "[]")

    if not isinstance(portal_users, (list, tuple)):
        frappe.throw("Invalid portal user data")

    # Check if user has read permission on Customer doctype
    if not frappe.has_permission("Customer", "read", customer_id):
        frappe.throw("You do not have permission to access this customer")

    customer = frappe.get_doc("Customer", customer_id)
    cleaned_rows = []
    allowed_fields = {
        "name",
        "user"
    }
    for row in portal_users:
        if not isinstance(row, dict):
            continue
        cleaned = {field: row.get(field) for field in allowed_fields if field in row}
        cleaned_rows.append(cleaned)

    customer.set("portal_users", cleaned_rows)
    customer.save()
    frappe.db.commit()

    return [
        {
            "name": row.name,
            "user": getattr(row, "user", "")
        }
        for row in (customer.portal_users or [])
    ]

@frappe.whitelist()
def get_users_basic_info(users):
    """
    Fetch minimal User info safely (image + name)
    Handles permission errors gracefully
    """
    try:
        if isinstance(users, str):
            try:
                users = json.loads(users)
            except (json.JSONDecodeError, ValueError):
                users = []

        if not users or not isinstance(users, (list, tuple)):
            return []

        # Attempt to fetch with ignore_permissions=True
        try:
            return frappe.get_all(
                "User",
                filters={"name": ["in", users]},
                fields=["name", "full_name", "user_image", "email"],
                ignore_permissions=True
            )
        except frappe.PermissionError:
            # If still denied, try with current user's permissions
            try:
                return frappe.get_all(
                    "User",
                    filters={"name": ["in", users]},
                    fields=["name", "full_name", "email"],
                    order_by="full_name"
                )
            except frappe.PermissionError:
                # Last resort: return minimal safe data
                frappe.log_error(f"Permission denied for users: {users}")
                return []
                
    except Exception as e:
        frappe.log_error(f"Error fetching user info: {str(e)}")
        return []

@frappe.whitelist()
def get_contact_emails(customer=None):
    """
    Fetch:
    1. Contact emails linked to a customer (if provided)
    2. All active system user emails in the company
    """

    emails = set()

    # 🟢 1. Get Contact emails linked to Customer
    if customer:
        linked_contacts = frappe.db.sql("""
            SELECT c.email_id
            FROM `tabContact` c
            JOIN `tabDynamic Link` dl ON dl.parent = c.name
            WHERE dl.link_doctype = 'Customer'
              AND dl.link_name = %s
              AND c.email_id IS NOT NULL
        """, (customer,), as_dict=True)
        emails.update([c.email_id for c in linked_contacts if c.email_id])

    else:
        # If no customer passed, get all contacts with email
        all_contacts = frappe.get_all("Contact", fields=["email_id"], filters={"email_id": ["!=", ""]})
        emails.update([c.email_id for c in all_contacts if c.email_id])

    # 🟢 2. Get Active System Users (excluding Guest / Administrator)
    system_users = frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "name": ["not in", ["Administrator", "Guest"]],
            "user_type":"System User",
            "email": ["!=", ""]
        },
        fields=["email"]
    )
    emails.update([u.email for u in system_users if u.email])

    # Convert to sorted list
    return sorted(list(emails))

@frappe.whitelist()
def send_issue_email(recipients=None, cc=None, bcc=None, subject=None, content=None, customer=None, issue=None, attachments=None, send_me_a_copy=0):
    """Send email from Customer page ensuring file attachments are correctly linked to the Communication."""
    # Support both customer and issue parameters for backward compatibility
    if not customer and not issue:
        frappe.throw("Missing customer or issue parameter")
    if not subject or not content or not recipients:
        frappe.throw("Missing required fields")

    from frappe.core.doctype.communication.email import add_attachments

    # normalize attachments: accept list/dict/str; resolve file_url -> File name
    resolved_attachments = []
    try:
        import json
        if isinstance(attachments, str):
            try:
                attachments = json.loads(attachments)
            except Exception:
                # allow comma-separated urls
                if "," in attachments:
                    attachments = [a.strip() for a in attachments.split(",") if a.strip()]
                else:
                    attachments = [attachments]

        if attachments:
            if isinstance(attachments, dict):
                attachments = [attachments]

            if isinstance(attachments, list):
                for att in attachments:
                    file_url = None
                    if isinstance(att, dict):
                        file_url = att.get("file_url") or att.get("file_name") or att.get("name")
                    elif isinstance(att, str):
                        file_url = att

                    if not file_url:
                        continue

                    file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
                    if file_name:
                        resolved_attachments.append(file_name)
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="send_issue_email attachment resolution failed")

    # If user wants a copy, add current user's email to recipients (avoid duplicates)
    try:
        if send_me_a_copy:
            current_user = frappe.session.user
            current_email = frappe.db.get_value("User", current_user, "email") or current_user

            def _to_list(value):
                if not value:
                    return []
                if isinstance(value, (list, tuple)):
                    return [v for v in value if v]
                return [v.strip() for v in str(value).split(",") if v.strip()]

            rec_list = _to_list(recipients)
            rec_set = {r.strip().lower() for r in rec_list if r}
            if current_email and current_email.strip().lower() not in rec_set:
                rec_list.append(current_email)

            recipients = ", ".join(rec_list)
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="send_issue_email send_me_a_copy failed")

    comm = frappe.get_doc({
        "doctype": "Communication",
        "subject": subject,
        "content": content,
        "sender": frappe.session.user,
        "recipients": recipients,
        "cc": cc or None,
        "bcc": bcc or None,
        "communication_medium": "Email",
        "sent_or_received": "Sent",
        "reference_doctype": "Customer",
        "reference_name": customer,
        "has_attachment": 1 if resolved_attachments else 0,
        "communication_type": "Communication",
    })
    comm.insert(ignore_permissions=True)

    if resolved_attachments:
        add_attachments(comm.name, resolved_attachments)

    comm.send_email(send_me_a_copy=False)

    return {"message": "Email sent"}

import frappe

@frappe.whitelist()
def update_customer_status(customer_id, status):
    if not frappe.db.exists("Customer", customer_id):
        frappe.throw("Customer not found")

    customer = frappe.get_doc("Customer", customer_id)
    customer.custom_customer_status = status

    # 🔴 This bypasses permission checks
    customer.save(ignore_permissions=True)

    frappe.db.commit()

    return status


@frappe.whitelist()
def add_custom_comment(docname, content):
    if not docname or not content:
        frappe.throw("Missing required fields")

    doc = frappe.get_doc("Customer", docname)
    doc.add_comment("Comment", content)
    frappe.db.commit()
    return {"message": "Comment added successfully"}

import frappe
@frappe.whitelist()
def get_issue_activity(name):
    """Return chronological activity timeline for an issue."""
    if not name:
        return []
    
    activity = []

    # --- 1. Comments (All Types) ---
    comments = frappe.get_all(
        "Comment",
        filters={"reference_doctype": "Customer", "reference_name": name},
        fields=["content", "creation", "owner", "comment_type", "comment_email"],
        order_by="creation desc"
    )

    # Map comment types to readable titles and colors
    comment_type_map = {
        "Comment": ("Commented", "warning"),
        "Like": ("Liked", "info"),
        "Info": ("Info Added", "secondary"),
        "Label": ("Label Added", "secondary"),
        "Workflow": ("Workflow Updated", "purple"),
        "Created": ("Document Created", "danger"),
        "Submitted": ("Submitted", "success"),
        "Cancelled": ("Cancelled", "danger"),
        "Updated": ("Updated", "info"),
        "Deleted": ("Deleted", "dark"),
        "Assigned": ("Assigned", "info"),
        "Assignment Completed": ("Assignment Completed", "success"),
        "Attachment": ("File Attached", "info"),
        "Attachment Removed": ("File Removed", "dark"),
        "Shared": ("Shared", "primary"),
        "Unshared": ("Unshared", "dark"),
        "Bot": ("Bot Activity", "secondary"),
        "Relinked": ("Relinked", "warning"),
        "Edit": ("Edited", "info")
    }

    for c in comments:
        user_fullname = frappe.utils.get_fullname(c.owner)
        
        comment_label, comment_color = comment_type_map.get(c.comment_type, ("Activity", "info"))

        # Default description
        desc = frappe.utils.strip_html_tags(c.content or "")

        # Optional: adjust messages for specific types
        # if c.comment_type == "Assigned":
        #     desc = f"{c.content}"
        # elif c.comment_type == "Attachment":
        #     desc = f"Attachment added by {user_fullname}"
        # elif c.comment_type == "Attachment Removed":
        #     desc = f"Attachment removed by {user_fullname}"
        # elif c.comment_type == "Deleted":
        #     desc = f"Deleted by {user_fullname}"

        activity.append({
            "type": c.comment_type,
            "title": f"{c.comment_email or user_fullname} {comment_label}",
            "description": desc,
            "timestamp": frappe.utils.format_datetime(c.creation, "medium"),
            "by": user_fullname,
            "color": comment_color,
            "is_html": True
        })


    # --- 2. Communications (Emails) ---
    communications = frappe.get_all(
        "Communication",
        filters={"reference_doctype": "Customer", "reference_name": name},
        fields=["subject", "content", "sender_full_name", "creation", "communication_type","sender","recipients"],
        order_by="creation desc"
    )
    for c in communications:
        activity.append({
            "type": "Communication",
            "title": f"Notification sent to {c.recipients}" or "Communication Added",
            "description": c.content or "",
            "timestamp": frappe.utils.format_datetime(c.creation, "medium"),
            "by": c.sender_full_name or "System",
            "color": "info",
            "is_html": True
        })

    # --- 3. Status Changes (from Version) ---
    versions = frappe.get_all(
        "Version",
        filters={"ref_doctype": "Customer", "docname": name},
        fields=["data", "creation", "owner"],
        order_by="creation desc"
    )
    for v in versions:
        data = frappe.parse_json(v.data)
        if data and "changed" in data:
            for change in data["changed"]:
                if change[0] == "status":
                    old_status, new_status = change[1], change[2]
                    user_fullname = frappe.utils.get_fullname(v.owner)
                    activity.append({
                        "type": "Status Change",
                        "title": f'Status Changed to "{new_status}"',
                        "description": f'Status updated from {old_status or "None"} to {new_status}.',
                        "timestamp": frappe.utils.format_datetime(v.creation, "medium"),
                        "by": user_fullname,
                        "color": "info",
                        "is_html": False
                    })

    # --- Sort All Activities by Date ---
    activity.sort(key=lambda x: frappe.utils.get_datetime(x["timestamp"]), reverse=True)
    return activity


@frappe.whitelist()
def get_connection_count(doctype, customer_id, customer_field="customer"):
	"""
	Get count of documents linked to a customer.
	Handles different field names for different doctypes.
	"""
	try:
		if not doctype or not customer_id:
			return 0
		
		# Build filters dynamically based on the customer_field
		filters = {customer_field: customer_id}
		
		count = frappe.db.count(doctype, filters)
		return count
	except Exception as e:
		frappe.log_error(f"Error in get_connection_count: {str(e)}")
		return 0


@frappe.whitelist()
def get_connection_data(doctype, customer_id, customer_field="customer"):
	"""
	Get all documents linked to a customer with doctype-specific fields.
	"""
	try:
		if not doctype or not customer_id:
			return []
		
		# Build filters dynamically
		filters = {customer_field: customer_id}
		
		# Define doctype-specific fields
		doctype_fields = {
			"Opportunity": ["name", "creation", "status", "opportunity_type", "lead_name", "total"],
			"Quotation": ["name", "creation", "status", "quote_date", "grand_total", "total"],
			"Customer Order Form": ["name", "creation", "status", "total"],
			"Sales Order": ["name", "creation", "status", "delivery_date", "grand_total", "total"],
			"Sales Invoice": ["name", "creation", "status", "posting_date", "grand_total", "total", "outstanding_amount"],
			"Renewal List": ["name", "creation", "status", "start_date", "end_date", "total_amount"],
			"Issue": ["name", "creation", "status", "priority", "subject", "assigned_to"],
			"Call List": ["name", "creation", "status", "start_date","start_timing", "end_date","end_timing", "subject"],
            "Payment Entry": ["name", "creation", "status", "posting_date", "total_allocated_amount","paid_amount"]
		}
		
		# Get appropriate fields for this doctype
		available_fields = doctype_fields.get(doctype, ["name", "creation", "modified", "status"])
		
		# Fetch the documents
		documents = frappe.get_list(
			doctype,
			filters=filters,
			fields=available_fields,
			order_by="creation desc",
			limit_page_length=None
		)
		
		# Map doctypes to their child table names and item fields
		child_table_map = {
			"Opportunity": {
				"child_doctype": "Opportunity Item",
				"fields": ["item_code", "item_name", "qty", "rate", "sales_stage", "amount"]
			},
			"Quotation": {
				"child_doctype": "Quotation Item",
				"fields": ["item_code", "item_name", "qty", "rate", "amount"]
			},
			"Sales Order": {
				"child_doctype": "Sales Order Item",
				"fields": ["item_code", "item_name", "delivery_date", "qty", "rate", "amount"]
			},
			"Sales Invoice": {
				"child_doctype": "Sales Invoice Item",
				"fields": ["item_code", "item_name", "qty", "rate", "amount"]
			},
			"Customer Order Form": {
				"child_doctype": "Customer Order Form Item",
				"fields": ["item_code", "item_name", "qty", "rate", "amount", "purchase_rate", "purchase_amount", "margin_amount"]
			},
			"Renewal List": {
				"child_doctype": "Renewal Item",
				"fields": ["item_name", "qty", "rate", "amount", "start_date", "end_date", "invoice_no"]
			},
            "Payment Entry": {
                "child_doctype": "Payment Entry Reference",
                "fields": ["reference_name", "allocated_amount","reference_doctype","total_amount","outstanding_amount","due_date"]
            }
		}
		
		# Fetch item details for each document
		for doc in documents:
			doc["items"] = []
			
			if doctype == "Renewal List":
				# For Renewal List, fetch items from child table
				try:
					item_config = child_table_map.get(doctype)
					if item_config:
						items = frappe.get_all(
							item_config["child_doctype"],
							filters={"parent": doc.name},
							fields=item_config["fields"],
							order_by="idx asc",
							limit_page_length=None
						)
						
						if items:
							for item in items:
								doc["items"].append({
									"item_name": item.get("item_name") or "N/A",
									"qty": flt(item.get("qty", 0)),
									"rate": flt(item.get("rate", 0)),
									"amount": flt(item.get("amount", 0)),
									"start_date": item.get("start_date"),
									"end_date": item.get("end_date"),
									"invoice_no": item.get("invoice_no", "")
								})
				except Exception as e:
					frappe.log_error(f"Error fetching Renewal List items for {doc.name}: {str(e)}")
			elif doctype in child_table_map:
				item_config = child_table_map[doctype]
				child_doctype = item_config["child_doctype"]
				fields = item_config["fields"]
				
				try:
					# Fetch items from child table
					items = frappe.get_all(
						child_doctype,
						filters={"parent": doc.name},
						fields=fields,
						order_by="idx asc",
						limit_page_length=None
					)
					
					if items:
						if items:
							for item in items:
								item_data = {
									"item_name": item.get("item_name") or item.get("item_code") or "N/A",
									"qty": flt(item.get("qty", 0)),
									"rate": flt(item.get("rate", 0)),
									"amount": flt(item.get("amount", 0))
								}
								
								# Add doctype-specific fields
								if doctype == "Opportunity":
									item_data["sales_stage"] = item.get("sales_stage", "")
								elif doctype == "Sales Order":
									item_data["delivery_date"] = item.get("delivery_date")
								elif doctype == "Customer Order Form":
									item_data["purchase_rate"] = flt(item.get("purchase_rate", 0))
									item_data["purchase_amount"] = flt(item.get("purchase_amount", 0))
									item_data["margin_amount"] = flt(item.get("margin_amount", 0))
								
								doc["items"].append(item_data)
					else:
						frappe.log_error(f"No items found for {doctype} - {doc.name} using child doctype: {child_doctype}")
				except Exception as e:
					frappe.log_error(f"Error fetching items for {doctype} (child: {child_doctype}), doc {doc.name}: {str(e)}")
		
		return documents
	except Exception as e:
		frappe.log_error(f"Error in get_connection_data: {str(e)}")
		return []


@frappe.whitelist()
def get_customer_stats(customer_id):
    """
    Fetch customer financial statistics including annual billing and total unpaid
    Based on fiscal year (01 April to 31 March)
    """
    try:
        from erpnext.accounts.party import get_dashboard_info
        from erpnext.accounts.utils import get_fiscal_year
        from frappe.utils import nowdate

        current_fy = get_fiscal_year(nowdate(), as_dict=True)
        company_info = get_dashboard_info("Customer", customer_id)

        annual_billing = 0
        total_unpaid = 0
        currency = frappe.defaults.get_global_default("currency") or "INR"

        if company_info:
            annual_billing = sum(flt(d.get("billing_this_year") or 0) for d in company_info)
            total_unpaid = sum(flt(d.get("total_unpaid") or 0) for d in company_info)
            if len(company_info) == 1 and company_info[0].get("currency"):
                currency = company_info[0].get("currency")

        return {
            "annual_billing": flt(annual_billing, 2),
            "total_unpaid": flt(total_unpaid, 2),
            "currency": currency,
            "fiscal_year_start": current_fy.year_start_date.strftime("%d-%m-%Y"),
            "fiscal_year_end": current_fy.year_end_date.strftime("%d-%m-%Y")
        }
        
    except Exception as e:
        frappe.log_error(f"Error fetching customer stats for {customer_id}: {str(e)}", "Customer Stats Error")
        return {
            "annual_billing": 0,
            "total_unpaid": 0,
            "currency": "INR",
            "error": str(e)
        }
		


# @frappe.whitelist()
# def get_recent_activities(customer_id):
# 	"""
# 	Fetch the most recent activities across all customer-related doctypes
# 	Returns activities created within the last month from Opportunity, Quotation, Customer Order Form,
# 	Sales Order, Sales Invoice, Renewal List, Issue, and Call List
# 	"""
# 	try:
# 		from datetime import timedelta
		
# 		activities = []
		
# 		# Calculate date range: 1 month back from today
# 		today = now_datetime()
# 		one_month_ago = today - timedelta(days=30)
		
# 		# Define doctypes and their specific fields
# 		doctypes_config = [
# 			{
# 				"doctype": "Opportunity",
# 				"customer_field": "party_name",
# 				"fields": ["name", "creation", "modified", "status", "opportunity_type", "transaction_date","total"],
# 				"icon": "fa-handshake-o",
# 				"color": "#667eea"
# 			},
# 			{
# 				"doctype": "Quotation",
# 				"customer_field": "party_name",
# 				"fields": ["name", "creation", "modified", "status", "transaction_date", "grand_total"],
# 				"icon": "fa-file-text-o",
# 				"color": "#f093fb"
# 			},
# 			{
# 				"doctype": "Customer Order Form",
# 				"customer_field": "customer",
# 				"fields": ["name", "creation", "modified", "status", "total","grand_total","rounded_total"],
# 				"icon": "fa-wpforms",
# 				"color": "#4facfe"
# 			},
# 			{
# 				"doctype": "Sales Order",
# 				"customer_field": "customer",
# 				"fields": ["name", "creation", "modified", "status", "transaction_date", "grand_total"],
# 				"icon": "fa-shopping-cart",
# 				"color": "#43e97b"
# 			},
# 			{
# 				"doctype": "Sales Invoice",
# 				"customer_field": "customer",
# 				"fields": ["name", "creation", "modified", "status", "posting_date", "grand_total", "outstanding_amount"],
# 				"icon": "fa-file-invoice",
# 				"color": "#fa709a"
# 			},
# 			{
# 				"doctype": "Renewal List",
# 				"customer_field": "customer_name",
# 				"fields": ["name", "creation", "modified", "status", "start_date", "end_date","total_amount"],
# 				"icon": "fa-refresh",
# 				"color": "#a8edea"
# 			},
# 			{
# 				"doctype": "Issue",
# 				"customer_field": "customer",
# 				"fields": ["name", "creation", "modified", "status", "priority", "subject"],
# 				"icon": "fa-exclamation-circle",
# 				"color": "#ff6b6b"
# 			},
# 			{
# 				"doctype": "Call List",
# 				"customer_field": "name1",
# 				"fields": ["name", "creation", "modified", "status", "start_date", "subject"],
# 				"icon": "fa-phone",
# 				"color": "#48c6ef"
# 			},
#             {
#                  "doctype": "Payment Entry",
#                  "customer_field": "party",
#                  "fields": ["name", "creation", "modified", "status", "posting_date", "paid_amount","total_allocated_amount"],
#                  "icon": "fa-credit-card",
#                  "color": "#f7971e"
#             }
# 		]
		
# 		# Fetch records from each doctype created within the last month
# 		for config in doctypes_config:
# 			try:
# 				filters = {
# 					config["customer_field"]: customer_id,
# 					"creation": ["between", [one_month_ago, today]]
# 				}
# 				records = frappe.get_all(
# 					config["doctype"],
# 					filters=filters,
# 					fields=config["fields"],
# 					order_by="creation desc"
# 				)
				
# 				for record in records:
# 					activities.append({
# 						"doctype": config["doctype"],
# 						"name": record.name,
# 						"creation": record.creation,
# 						"modified": record.modified,
# 						"status": record.get("status"),
# 						"icon": config["icon"],
# 						"color": config["color"],
# 						"details": record
# 					})
# 			except Exception as e:
# 				frappe.log_error(f"Error fetching {config['doctype']}: {str(e)}")
# 				continue
		
# 		# Sort by creation date (most recent first) and return all
# 		activities.sort(key=lambda x: x["creation"], reverse=True)
# 		return activities
		
# 	except Exception as e:
# 		frappe.log_error(f"Error fetching recent activities for {customer_id}: {str(e)}", "Recent Activities Error")
# 		return []

@frappe.whitelist()
def get_recent_activities(customer_id):
	"""
	Fetch the most recent activities across all customer-related doctypes
	Returns the latest 5 activities from Opportunity, Quotation, Customer Order Form,
	Sales Order, Sales Invoice, Renewal List, Issue, and Call List
	"""
	try:
		activities = []
		
		# Define doctypes and their specific fields
		doctypes_config = [
			{
				"doctype": "Opportunity",
				"customer_field": "party_name",
				"fields": ["name", "creation", "modified", "status", "opportunity_type", "transaction_date","total"],
				"icon": "fa-handshake-o",
				"color": "#667eea"
			},
			{
				"doctype": "Quotation",
				"customer_field": "party_name",
				"fields": ["name", "creation", "modified", "status", "transaction_date", "grand_total"],
				"icon": "fa-file-text-o",
				"color": "#f093fb"
			},
			{
				"doctype": "Customer Order Form",
				"customer_field": "customer",
				"fields": ["name", "creation", "modified", "status", "total"],
				"icon": "fa-wpforms",
				"color": "#4facfe"
			},
			{
				"doctype": "Sales Order",
				"customer_field": "customer",
				"fields": ["name", "creation", "modified", "status", "transaction_date", "grand_total"],
				"icon": "fa-shopping-cart",
				"color": "#43e97b"
			},
			{
				"doctype": "Sales Invoice",
				"customer_field": "customer",
				"fields": ["name", "creation", "modified", "status", "posting_date", "grand_total", "outstanding_amount"],
				"icon": "fa-file-invoice",
				"color": "#fa709a"
			},
			{
				"doctype": "Renewal List",
				"customer_field": "customer_name",
				"fields": ["name", "creation", "modified", "status", "start_date", "end_date","total_amount"],
				"icon": "fa-refresh",
				"color": "#a8edea"
			},
			{
				"doctype": "Issue",
				"customer_field": "customer",
				"fields": ["name", "creation", "modified", "status", "priority", "subject"],
				"icon": "fa-exclamation-circle",
				"color": "#ff6b6b"
			},
			{
				"doctype": "Call List",
				"customer_field": "name1",
				"fields": ["name", "creation", "modified", "status", "start_date", "subject"],
				"icon": "fa-phone",
				"color": "#48c6ef"
			},
            {
                 "doctype": "Payment Entry",
                 "customer_field": "party",
                 "fields": ["name", "creation", "modified", "status", "posting_date", "paid_amount","total_allocated_amount"],
                 "icon": "fa-credit-card",
                 "color": "#f7971e"
            }
		]
		
		# Fetch latest 5 records from each doctype
		for config in doctypes_config:
			try:
				filters = {config["customer_field"]: customer_id}
				records = frappe.get_all(
					config["doctype"],
					filters=filters,
					fields=config["fields"],
					order_by="creation desc",
					limit=5
				)
				
				# Add all records (up to 5) from this doctype
				for record in records:
					activities.append({
						"doctype": config["doctype"],
						"name": record.name,
						"creation": record.creation,
						"modified": record.modified,
						"status": record.get("status"),
						"icon": config["icon"],
						"color": config["color"],
						"details": record
					})
			except Exception as e:
				frappe.log_error(f"Error fetching {config['doctype']}: {str(e)}")
				continue
		
		# Sort by creation date and return all (up to 5 from each doctype)
		activities.sort(key=lambda x: x["creation"], reverse=True)
		return activities
		
	except Exception as e:
		frappe.log_error(f"Error fetching recent activities for {customer_id}: {str(e)}", "Recent Activities Error")
		return []


def _get_sales_fiscal_year_dates(fiscal_year=None):
    from erpnext.accounts.utils import get_fiscal_year
    from frappe.utils import nowdate

    # If fiscal_year is empty, return None to indicate no date filtering needed
    if not fiscal_year:
        return None

    return get_fiscal_year(fiscal_year=fiscal_year, as_dict=True)


# @frappe.whitelist()
# def get_sales_by_item_group(customer_id, fiscal_year=None):
# 	"""
#     Get sales data grouped by Item Group for a customer Based on Sales Invoice Items 
#     """
#     try:
#         fiscal = _get_sales_fiscal_year_dates(fiscal_year)
#         query = """
#             SELECT 
#                 i.item_group,
#                 SUM(sii.amount) as amount
#             FROM `tabSales Invoice Item` sii
#             INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
#             INNER JOIN `tabItem` i ON sii.item_code = i.name
#             WHERE si.customer = %(customer)s
#             AND si.docstatus = 1
#             AND si.posting_date BETWEEN %(year_start)s AND %(year_end)s
#             AND i.item_group IS NOT NULL
#             GROUP BY i.item_group
#             ORDER BY amount DESC
#         """

#         result = frappe.db.sql(
#             query,
#             {
#                 "customer": customer_id,
#                 "year_start": fiscal.year_start_date,
#                 "year_end": fiscal.year_end_date
#             },
#             as_dict=True
#         )
#         return result
		
#     except Exception as e:
#         frappe.log_error(f"Error fetching sales by item group for {customer_id}: {str(e)}", "Sales by Item Group Error")
#         return []


# @frappe.whitelist()
# def get_sales_by_brand(customer_id, fiscal_year=None):
# 	"""
# 	Get sales data grouped by Brand for a customer
# 	Based on Sales Invoice Items
# 	"""
#     try:
#         fiscal = _get_sales_fiscal_year_dates(fiscal_year)
#         query = """
#             SELECT 
#                 COALESCE(i.brand, 'No Brand') as brand,
#                 SUM(sii.amount) as amount
#             FROM `tabSales Invoice Item` sii
#             INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
#             INNER JOIN `tabItem` i ON sii.item_code = i.name
#             WHERE si.customer = %(customer)s
#             AND si.docstatus = 1
#             AND si.posting_date BETWEEN %(year_start)s AND %(year_end)s
#             GROUP BY i.brand
#             ORDER BY amount DESC
#         """

#         result = frappe.db.sql(
#             query,
#             {
#                 "customer": customer_id,
#                 "year_start": fiscal.year_start_date,
#                 "year_end": fiscal.year_end_date
#             },
#             as_dict=True
#         )
#         return result
		
#     except Exception as e:
#         frappe.log_error(f"Error fetching sales by brand for {customer_id}: {str(e)}", "Sales by Brand Error")
#         return []

@frappe.whitelist()
def get_sales_by_item_group(customer_id, fiscal_year=None):
    """
    Get sales data grouped by Item Group for a customer
    Based on Sales Invoice Items
    fiscal_year=None or empty string will show ALL data across all years
    """
    try:
        # Handle the fiscal_year parameter - empty string means show all
        if fiscal_year == "" or fiscal_year is None:
            fiscal_year = None
        
        fiscal = _get_sales_fiscal_year_dates(fiscal_year)

        # Build WHERE clause dynamically - skip date filter if fiscal is None
        where_clause = """
                si.customer = %(customer)s
                AND si.docstatus = 1
        """
        
        if fiscal:
            where_clause += """
                AND si.posting_date BETWEEN %(year_start)s AND %(year_end)s
            """
        
        where_clause += """
                AND i.item_group IS NOT NULL
        """

        query = f"""
            SELECT 
                i.item_group,
                SUM(sii.amount) AS amount
            FROM `tabSales Invoice Item` sii
            INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
            INNER JOIN `tabItem` i ON sii.item_code = i.name
            WHERE {where_clause}
            GROUP BY i.item_group
            ORDER BY amount DESC
        """

        query_params = {
            "customer": customer_id,
        }
        
        if fiscal:
            query_params["year_start"] = fiscal.get("year_start_date")
            query_params["year_end"] = fiscal.get("year_end_date")

        result = frappe.db.sql(
            query,
            query_params,
            as_dict=True,
        )

        return result

    except Exception as e:
        frappe.log_error(
            f"Error fetching sales by item group for {customer_id}: {str(e)}",
            "Sales by Item Group Error",
        )
        return []


@frappe.whitelist()
def get_sales_by_brand(customer_id, fiscal_year=None):
    """
    Get sales data grouped by Brand for a customer
    Based on Sales Invoice Items
    fiscal_year=None or empty string will show ALL data across all years
    """
    try:
        # Handle the fiscal_year parameter - empty string means show all
        if fiscal_year == "" or fiscal_year is None:
            fiscal_year = None
        
        fiscal = _get_sales_fiscal_year_dates(fiscal_year)

        # Build WHERE clause dynamically - skip date filter if fiscal is None
        where_clause = """
                si.customer = %(customer)s
                AND si.docstatus = 1
        """
        
        if fiscal:
            where_clause += """
                AND si.posting_date BETWEEN %(year_start)s AND %(year_end)s
            """

        query = f"""
            SELECT 
                COALESCE(i.brand, 'No Brand') AS brand,
                SUM(sii.amount) AS amount
            FROM `tabSales Invoice Item` sii
            INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
            INNER JOIN `tabItem` i ON sii.item_code = i.name
            WHERE {where_clause}
            GROUP BY i.brand
            ORDER BY amount DESC
        """

        query_params = {
            "customer": customer_id,
        }
        
        if fiscal:
            query_params["year_start"] = fiscal.get("year_start_date")
            query_params["year_end"] = fiscal.get("year_end_date")

        result = frappe.db.sql(
            query,
            query_params,
            as_dict=True,
        )

        return result

    except Exception as e:
        frappe.log_error(
            f"Error fetching sales by brand for {customer_id}: {str(e)}",
            "Sales by Brand Error",
        )
        return []