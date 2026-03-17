import frappe
from frappe.utils import getdate, nowdate

def execute(filters=None):
    filters = filters or {}

    columns, data = get_customers_data(filters)

    return columns, data


def get_columns():
    return [
        {"label": "Select", "fieldname": "select_row", "fieldtype": "Check", "width": 60},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 260},
        {"label": "Sales Person", "fieldname": "sales_person", "fieldtype": "Data", "width": 180},
        {"label": "Created By", "fieldname": "owner", "fieldtype": "Data", "width": 160},

        {"label": "Contact Name", "fieldname": "contact_name", "fieldtype": "Data", "width": 160},
        {"label": "Email", "fieldname": "email_id", "fieldtype": "Data", "width": 200},
        {"label": "Mobile", "fieldname": "mobile_no", "fieldtype": "Data", "width": 120},

        {"label": "City", "fieldname": "city", "fieldtype": "Data", "width": 120},
        {"label": "State", "fieldname": "state", "fieldtype": "Data", "width": 120},

        {"label": "Company", "fieldname": "company", "fieldtype": "Link", "options": "Company", "width": 120},
        {"label": "Invoice Count", "fieldname": "invoice_count", "fieldtype": "Int", "width": 120},
        {"label": "Sales Amount", "fieldname": "sales_amount", "fieldtype": "Currency", "width": 130},
        
        {"label": "Renewal Count", "fieldname": "renewal_count", "fieldtype": "Int", "width": 120},
        {"label": "Renewal Amount", "fieldname": "renewal_amount", "fieldtype": "Currency", "width": 130},
        
        {"label": "Total Sales", "fieldname": "total_sales", "fieldtype": "Currency", "width": 130},
        {"label": "Total Renewals", "fieldname": "total_renewals", "fieldtype": "Currency", "width": 130},
    ]



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



def get_customers_data(filters):
    conditions, values = get_conditions(filters)
    sub_conditions = []

    # -----------------------
    # CONTACT FILTERS
    # -----------------------
    if filters.get("contacts") == "Customers With Contacts":
        sub_conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabDynamic Link` dl
                WHERE dl.link_doctype = 'Customer'
                AND dl.link_name = tc.name
                AND dl.parenttype = 'Contact'
            )
        """)
    elif filters.get("contacts") == "Customers Without Contacts":
        sub_conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabDynamic Link` dl
                WHERE dl.link_doctype = 'Customer'
                AND dl.link_name = tc.name
                AND dl.parenttype = 'Contact'
            )
        """)

    # -----------------------
    # OPPORTUNITY FILTERS
    # -----------------------
    if filters.get("opportunity") == "Customers With Opps":
        sub_conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabOpportunity` o
                WHERE o.party_name = tc.name
            )
        """)
    elif filters.get("opportunity") == "Customers Without Opps":
        sub_conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabOpportunity` o
                WHERE o.party_name = tc.name
            )
        """)

    # -----------------------
    # INVOICE FILTERS
    # -----------------------
    if filters.get("invoice") == "Customers With Invoice":
        sub_conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabSales Invoice` si
                WHERE si.customer = tc.name
                AND si.docstatus = 1
            )
        """)
    elif filters.get("invoice") == "Customers Without Invoice":
        sub_conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabSales Invoice` si
                WHERE si.customer = tc.name
                AND si.docstatus = 1
            )
        """)

    # -----------------------
    # RENEWAL FILTERS (Renewal List)
    # -----------------------
    if filters.get("renewals") == "Customers With Renewals":
        sub_conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabRenewal List` r
                WHERE r.customer_name = tc.name
            )
        """)
    elif filters.get("renewals") == "Customers Without Renewals":
        sub_conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabRenewal List` r
                WHERE r.customer_name = tc.name
            )
        """)

    if sub_conditions:
        conditions += " AND " + " AND ".join(sub_conditions)

    # -----------------------
    # AMOUNT HAVING
    # -----------------------
    having_clause = ""
    amount_range = filters.get("amount_range")
    from_amount = filters.get("from_amount")
    to_amount = filters.get("to_amount")

    if amount_range and amount_range != "Custom":
        slabs = {
            "0-50K": "BETWEEN 0 AND 50000",
            "50K-1L": "BETWEEN 50001 AND 100000",
            "1L-5L": "BETWEEN 100001 AND 500000",
            "5L+": "> 500000"
        }
        if amount_range in slabs:
            having_clause = f"HAVING total_sales {slabs[amount_range]}"

    elif amount_range == "Custom":
        if from_amount and to_amount:
            having_clause = f"HAVING total_sales BETWEEN {from_amount} AND {to_amount}"
        elif from_amount:
            having_clause = f"HAVING total_sales >= {from_amount}"
        elif to_amount:
            having_clause = f"HAVING total_sales <= {to_amount}"

    # -----------------------
    # FINAL QUERY - Get customer base data
    # -----------------------
    customer_data = frappe.db.sql(f"""
        SELECT DISTINCT
            tc.name AS customer,
            tc.owner,
            tst.sales_person,
            tc.employees,
            tc.gstin,
            tc.industry,
            tc.territory

        FROM tabCustomer tc

        INNER JOIN `tabSales Team` tst
            ON tst.parent = tc.name

        WHERE 1=1 {conditions}

        ORDER BY tc.name
        
    """, values, as_dict=True)

    # Build hierarchical data with company-wise breakdown
    data = []
    
    for customer in customer_data:
        customer_name = customer['customer']
        
        # Get all contacts for this customer
        contacts = frappe.db.sql("""
            SELECT DISTINCT
                dl.parent AS contact_name,
                c.email_id,
                c.mobile_no,
                c.first_name
            FROM `tabDynamic Link` dl
            LEFT JOIN tabContact c ON c.name = dl.parent
            WHERE dl.link_doctype = 'Customer'
            AND dl.link_name = %s
            AND dl.parenttype = 'Contact'
        """, (customer_name,), as_dict=True)
        
        # Get primary address for contact/customer
        primary_address = frappe.db.sql("""
            SELECT a.city, a.state
            FROM tabAddress a
            INNER JOIN `tabDynamic Link` dl ON dl.parent = a.name
            WHERE dl.link_doctype = 'Customer'
            AND dl.link_name = %s
            AND dl.parenttype = 'Address'
            AND a.is_primary_address = 1
            LIMIT 1
        """, (customer_name,), as_dict=True)
        
        address_info = primary_address[0] if primary_address else {'city': '', 'state': ''}
        
        # Get company-wise invoice data
        invoice_data = frappe.db.sql("""
            SELECT
                company,
                COUNT(DISTINCT name) AS invoice_count,
                IFNULL(SUM(grand_total), 0) AS sales_amount
            FROM `tabSales Invoice`
            WHERE customer = %s
            AND docstatus = 1
            GROUP BY company
                                     order BY sales_amount DESC
        """, (customer_name,), as_dict=True)
        
        # Get company-wise renewal data
        renewal_data = frappe.db.sql("""
            SELECT
                company,
                COUNT(DISTINCT name) AS renewal_count,
                IFNULL(SUM(total_amount), 0) AS renewal_amount
            FROM `tabRenewal List`
            WHERE customer_name = %s
            GROUP BY company
        """, (customer_name,), as_dict=True)
        
        # Calculate totals
        total_sales = sum(inv['sales_amount'] for inv in invoice_data)
        total_invoices = sum(inv['invoice_count'] for inv in invoice_data)
        total_renewals_amount = sum(ren['renewal_amount'] for ren in renewal_data)
        total_renewals_count = sum(ren['renewal_count'] for ren in renewal_data)
        
        # Add main customer row
        customer_row = {
            'select_row': 0,
            'customer': customer['customer'],
            'sales_person': customer['sales_person'],
            'owner': customer['owner'],
            'contact_name': '--- Customer Summary ---',
            'email_id': '',
            'mobile_no': '',
            'city': address_info.get('city', ''),
            'state': address_info.get('state', ''),
            'company': '',
            'invoice_count': total_invoices,
            'sales_amount': total_sales,
            'renewal_count': total_renewals_count,
            'renewal_amount': total_renewals_amount,
            'total_sales': total_sales,
            'total_renewals': total_renewals_amount,
            'indent': 0
        }
        data.append(customer_row)
        
        # Add company-wise invoice data as child rows
        for invoice in invoice_data:
            invoice_row = {
                'select_row': 0,
                'customer': '',
                'sales_person': '',
                'owner': '',
                'contact_name': f"  📊 Invoice - {invoice['company']}",
                'email_id': '',
                'mobile_no': '',
                'city': '',
                'state': '',
                'company': invoice['company'],
                'invoice_count': invoice['invoice_count'],
                'sales_amount': invoice['sales_amount'],
                'renewal_count': 0,
                'renewal_amount': 0,
                'total_sales': 0,
                'total_renewals': 0,
                'indent': 1
            }
            data.append(invoice_row)
        
        # Add company-wise renewal data as child rows
        for renewal in renewal_data:
            renewal_row = {
                'select_row': 0,
                'customer': '',
                'sales_person': '',
                'owner': '',
                'contact_name': f"  🔄 Renewal - {renewal['company']}",
                'email_id': '',
                'mobile_no': '',
                'city': '',
                'state': '',
                'company': renewal['company'],
                'invoice_count': 0,
                'sales_amount': 0,
                'renewal_count': renewal['renewal_count'],
                'renewal_amount': renewal['renewal_amount'],
                'total_sales': 0,
                'total_renewals': 0,
                'indent': 1
            }
            data.append(renewal_row)
        
        # Add contact details as child rows (if contacts exist)
        if contacts:
            for contact in contacts:
                contact_row = {
                    'select_row': 0,
                    'customer': '',
                    'sales_person': '',
                    'owner': '',
                    'contact_name': f"  👤 {contact['first_name']}",
                    'email_id': contact['email_id'] or '',
                    'mobile_no': contact['mobile_no'] or '',
                    'city': '',
                    'state': '',
                    'company': '',
                    'invoice_count': 0,
                    'sales_amount': 0,
                    'renewal_count': 0,
                    'renewal_amount': 0,
                    'total_sales': 0,
                    'total_renewals': 0,
                    'indent': 1
                }
                data.append(contact_row)

    return get_columns(), data
