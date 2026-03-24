# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
# def execute(filters=None):
# 	columns, data = [], []
# 	return columns, data

import frappe

def execute(filters=None):
    

    based_on = filters.get("based_on", "Customers")

    if based_on == "Customers":
        columns, data = get_customers_data(filters)
    elif based_on == "Customers Without Contacts":
        columns, data = get_customers_without_contacts(filters)
    elif based_on == "Customers With Contacts And No Opps":
        columns, data = get_customers_with_contacts_no_opps(filters)
    elif based_on == "Customers With Contacts With Opps":
        columns, data = get_customers_with_contacts_with_opps(filters)
    elif based_on == "Customers With Contacts And With Opps And No Sales Invoice":
        columns, data = get_customers_with_contacts_opps_no_invoice(filters)
    elif based_on == "Customers Without Renewals":
        columns, data = get_customers_without_renewals(filters)
    else:
        frappe.throw(f"Unknown filter option: {based_on}")



    currency = filters.presentation_currency or frappe.get_cached_value(
        "Company", filters.company, "default_currency"
    )

    # Initialize select_row to 0 for all rows
    for row in data:
        row["select_row"] = 0
        
    report_summary = get_report_summary(filters,columns, currency, data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))
    chart = get_chart_data(filters, columns, data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))

    return columns, data,None, chart, report_summary
    #return columns,data


def get_customers_data(filters):
    conditions, values = get_conditions(filters)
    where_clause = f"1=1 {conditions}"
    data = frappe.db.sql(f"""
        SELECT 0 AS select_row, tc.name as customer, tc.owner as owner, tst.sales_person
        FROM tabCustomer tc
        INNER JOIN `tabSales Team` tst ON tst.parent = tc.name
        WHERE {where_clause}
        GROUP BY tc.name
        ORDER BY tc.name
    """, values, as_dict=True)

    return get_columns(), data




def get_customers_without_contacts(filters):
    conditions, values = get_conditions(filters)
    data = frappe.db.sql(f"""
        SELECT 0 AS select_row, tc.name as customer, tc.owner as owner, tst.sales_person
        FROM tabCustomer tc
        INNER JOIN `tabSales Team` tst ON tst.parent = tc.name
        WHERE NOT EXISTS (
            SELECT 1 FROM `tabDynamic Link` tdl
            JOIN tabContact c ON tdl.parent = c.name
            WHERE tdl.link_doctype = 'Customer'
            AND tdl.link_name = tc.name
        ) {conditions}
        GROUP BY tc.name
    """, values, as_dict=True)

    return get_columns(), data


def get_customers_with_contacts_no_opps(filters):
    conditions, values = get_conditions(filters)
    data = frappe.db.sql(f"""
        SELECT DISTINCT tc.name AS customer, tc.owner, tst.sales_person
        FROM tabCustomer tc
        INNER JOIN `tabSales Team` tst ON tst.parent = tc.name
        WHERE EXISTS (
            SELECT 1 FROM `tabDynamic Link` tdl
            JOIN tabContact c ON tdl.parent = c.name
            WHERE tdl.link_doctype = 'Customer' AND tdl.link_name = tc.name
        )
        AND NOT EXISTS (
            SELECT 1 FROM `tabOpportunity` o WHERE o.party_name = tc.name
        ) {conditions}
        GROUP BY tc.name
    """, values, as_dict=True)

    return get_columns(), data


def get_customers_with_contacts_with_opps(filters):
    conditions, values = get_conditions(filters)
    data = frappe.db.sql(f"""
        SELECT DISTINCT tc.name AS customer, tc.owner, tst.sales_person
        FROM tabCustomer tc
        INNER JOIN `tabSales Team` tst ON tst.parent = tc.name
        WHERE EXISTS (
            SELECT 1 FROM `tabDynamic Link` tdl
            JOIN tabContact c ON tdl.parent = c.name
            WHERE tdl.link_doctype = 'Customer' AND tdl.link_name = tc.name
        )
        AND EXISTS (
            SELECT 1 FROM `tabOpportunity` o WHERE o.party_name = tc.name
        ) {conditions}
        GROUP BY tc.name
    """, values, as_dict=True)

    return get_columns(), data



def get_customers_with_contacts_opps_no_invoice(filters):
    conditions, values = get_conditions(filters)
    data = frappe.db.sql(f"""
        SELECT DISTINCT tc.name AS customer, tc.owner, tst.sales_person
        FROM tabCustomer tc
        INNER JOIN `tabSales Team` tst ON tst.parent = tc.name
        WHERE EXISTS (
            SELECT 1 FROM `tabDynamic Link` tdl
            JOIN tabContact c ON tdl.parent = c.name
            WHERE tdl.link_doctype = 'Customer' AND tdl.link_name = tc.name
        )
        AND EXISTS (
            SELECT 1 FROM `tabOpportunity` o WHERE o.party_name = tc.name
        )
        AND NOT EXISTS (
            SELECT 1 FROM `tabSales Invoice` si WHERE si.customer = tc.name
        ) {conditions}
        GROUP BY tc.name
    """, values, as_dict=True)

    return get_columns(), data



def get_customers_without_renewals(filters):
    conditions, values = get_conditions(filters)
    data = frappe.db.sql(f"""
        SELECT DISTINCT tc.name AS customer, tc.owner, tst.sales_person
        FROM tabCustomer tc
        INNER JOIN `tabSales Team` tst ON tst.parent = tc.name
        WHERE NOT EXISTS (
            SELECT 1 FROM `tabRenewal List` r WHERE r.customer_name = tc.name
        ) {conditions}
        GROUP BY tc.name
    """, values, as_dict=True)

    return get_columns(), data


def get_columns():
    return [
        {"label": "Select", "fieldname": "select_row", "fieldtype": "Check", "width": 60},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 300},
        {"label": "Sales Person", "fieldname": "sales_person", "fieldtype": "Data", "width": 200},
        {"label": "Created By", "fieldname": "owner", "fieldtype": "Data", "width": 200}
    ]

def get_allowed_sales_persons(user):
    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return None  # Means unrestricted access (show all)
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return []
    sales_person_doc = frappe.get_all("Sales Person", filters={"employee": employee}, fields=["name", "is_group"])
    if not sales_person_doc:
        return []
    sales_person = sales_person_doc[0]["name"]
    is_group = sales_person_doc[0]["is_group"]
    if is_group:
        children = frappe.get_all("Sales Person", filters={"parent_sales_person": sales_person}, pluck="name")
        return [sales_person] + children
    else:
        return [sales_person]



def get_conditions(filters):
    conditions = []
    values = {}

    user = frappe.session.user
    selected_sales_persons = filters.get("sales_person")

    if not selected_sales_persons:
        allowed_salespersons = get_allowed_sales_persons(user)
        if allowed_salespersons is not None:
            conditions.append("tst.sales_person IN %(allowed_sales_persons)s")
            values["allowed_sales_persons"] = tuple(allowed_salespersons)
    else:
        conditions.append("tst.sales_person IN %(sales_person)s")
        values["sales_person"] = tuple(selected_sales_persons)
	
    # Sales Person: MultiSelectList
    if filters.get("sales_person"):
        conditions.append("tst.sales_person IN %(sales_person)s")
        values["sales_person"] = tuple(filters.get("sales_person"))
    # Sales Person: MultiSelectList
    # if filters.get("sales_person"):
    #     conditions.append("tst.sales_person IN %(sales_person)s")
    #     values["sales_person"] = tuple(filters.get("sales_person"))

    if filters.get("territory"):
        conditions.append("tc.territory IN %(territory)s")
        values["territory"] = tuple(filters.get("territory"))	

    if filters.get("industry"):
        conditions.append("tc.industry IN %(industry)s")
        values["industry"] = tuple(filters.get("industry"))	    

    # Created By (User): MultiSelectList
    if filters.get("created_by"):
        conditions.append("tc.owner IN %(created_by)s")
        values["created_by"] = tuple(filters.get("created_by"))

    # Starts With (Customer Name)
    if filters.get("starts_with"):
        letters = filters.get("starts_with")
        like_conditions = []
        for i, letter in enumerate(letters):
            key = f"starts_with_{i}"
            like_conditions.append(f"tc.name LIKE %({key})s")
            values[key] = f"{letter}%"
        if like_conditions:
            conditions.append("(" + " OR ".join(like_conditions) + ")")

    return (" AND " + " AND ".join(conditions)) if conditions else "", values



def get_report_summary(filters,columns, currency, data):
    customer_count = 0
    
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(new)))

    if data:
        for period in data:
            if period.customer :
                customer_count += 1		

    customer_label = ("Customer Count")

    return [
        {
            "value": f"{customer_count:,}",
            "indicator": "Green",
            "label": "Customer Count",
            "datatype": "Data"
        }
    ]


def get_chart_data(filters, columns, data):
    customer_count = 0
    if data:
        for period in data:
            if period.customer:
                customer_count += 1

    return {
        "data": {
            "labels": ["Customers Count"],
            "datasets": [{"values": [customer_count]}],
        },
        "type": "pie",
        "colors": ["#c80064"],
    }
