# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

from collections import defaultdict
from rapidfuzz.fuzz import token_set_ratio, partial_ratio
from rapidfuzz.utils import default_process
import frappe
import json

@frappe.whitelist()
def execute(filters=None):
    columns = [
#         {
#     "label": "<input type='checkbox' id='select-header-checkbox' style='margin-right:5px;'/> Select",
#     "fieldname": "select_row",
#     "fieldtype": "Check",
#     "width": 80
# },
{
    "label": "<input type='checkbox' id='header-select-checkbox' style='margin-right:4px;'>Select",
    "fieldname": "select_row",
    "fieldtype": "Check",
    "width": 60
}
,





        {"label": "Select", "fieldname": "select_row", "fieldtype": "Check", "width": 60},
        {"label": "Main Customer", "fieldname": "main_customer", "fieldtype": "Link", "options": "Customer", "width": 300},
        {"label": "Duplicate Customer", "fieldname": "duplicate_customer", "fieldtype": "Link", "options": "Customer", "width": 300},
        {"label": "Similarity %", "fieldname": "similarity", "fieldtype": "Int", "width": 120},
        {"label": "Sales Person", "fieldname": "sales_person", "fieldtype": "Data", "width": 200},
        {"label": "Sales Person", "fieldname": "sales_person2", "fieldtype": "Data", "width": 200}
    ]

    customers = get_customers_with_sales_person()
    has_address, has_contact = preload_address_and_contacts()
    txn_customers = preload_customers_with_transactions()
    result = compute_similarity_with_main_logic(customers, filters, has_address, has_contact, txn_customers)
    return columns, sorted(result, key=lambda x: x["main_customer"])

def get_customers_with_sales_person():
    return frappe.db.sql("""
        SELECT c.name, c.customer_name, c.territory, st.sales_person
        FROM `tabCustomer` c
        LEFT JOIN `tabSales Team` st ON st.parent = c.name
        ORDER BY c.customer_name
    """, as_dict=True)

def preload_address_and_contacts():
    address_links = frappe.get_all("Dynamic Link",
        filters={"link_doctype": "Customer", "parenttype": "Address"},
        fields=["link_name"])
    contact_links = frappe.get_all("Dynamic Link",
        filters={"link_doctype": "Customer", "parenttype": "Contact"},
        fields=["link_name"])
    has_address = set(link["link_name"] for link in address_links)
    has_contact = set(link["link_name"] for link in contact_links)
    return has_address, has_contact

def preload_customers_with_transactions():
    txn_customers = set()
    mappings = [
        ("Opportunity", "customer_name"),
        ("Quotation", "party_name"),
        ("Sales Order", "customer"),
    ]
    for doctype, fieldname in mappings:
        records = frappe.get_all(doctype, fields=[fieldname])
        txn_customers.update(rec[fieldname] for rec in records if rec.get(fieldname))
    return txn_customers

def has_address_and_contact(customer_name, has_address, has_contact):
    return customer_name in has_address and customer_name in has_contact
def has_transactions(customer_name, txn_customers):
    return customer_name in txn_customers

# Updated stopwords list
STOPWORDS = {
    "pvt", "ltd", "private", "limited", "technologies", "group", "of",
    "company", "companies", "co", "inc", "solutions", "industries", "and", "the",
    "sai", "shree", "enterprises", "enterprise", "services", "polymer", "studio"
}

def clean_name(name):
    words = default_process(name).lower().split()
    return ' '.join([word for word in words if word not in STOPWORDS])

def compute_similarity_with_main_logic(customers, filters=None, has_address=None, has_contact=None, txn_customers=None):
    selected_salespersons = set()
    party_name_filter = set()
    if isinstance(filters, str):
        filters = json.loads(filters)
    if filters:
        if filters.get("sales_person"):
            selected_salespersons = set(filters["sales_person"])
        if filters.get("party_name"):
            party_name_filter = set(filters["party_name"])
    # Group customers based on cleaned and sorted name tokens
    grouped = defaultdict(list)
    for customer in customers:
        name = customer["customer_name"]
        if name:
            key = tuple(sorted(clean_name(name).split()))
            grouped[key].append(customer)
    data = []
    used_as_duplicate = set()
    for group in grouped.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                c1 = group[i]
                c2 = group[j]
                if c1["name"] in used_as_duplicate or c2["name"] in used_as_duplicate:
                    continue
                if c1.get("territory") != c2.get("territory"):
                    continue
                name1 = clean_name(c1["customer_name"])
                name2 = clean_name(c2["customer_name"])
                words1 = set(name1.split())
                words2 = set(name2.split())
                # Skip if names are too short after cleaning
                if len(words1) < 2 or len(words2) < 2:
                    continue
                # Skip if overlap is too weak
                common_words = words1 & words2
                if len(common_words) <= 1:
                    continue
                # Similarity calculations
                sim_token = token_set_ratio(name1, name2)
                sim_partial = partial_ratio(name1, name2)

                if sim_token >= 90 and sim_partial >= 85:
                    has_full_1 = has_address_and_contact(c1["name"], has_address, has_contact)
                    has_full_2 = has_address_and_contact(c2["name"], has_address, has_contact)
                    if has_full_1 and not has_full_2:
                        main, duplicate = c1, c2
                    elif has_full_2 and not has_full_1:
                        main, duplicate = c2, c1
                    elif has_full_1 and has_full_2:
                        txn1 = has_transactions(c1["name"], txn_customers)
                        txn2 = has_transactions(c2["name"], txn_customers)
                        if txn1 and not txn2:
                            main, duplicate = c1, c2
                        elif txn2 and not txn1:
                            main, duplicate = c2, c1
                        else:
                            main, duplicate = sorted([c1, c2], key=lambda x: x["customer_name"])
                    else:
                        continue

                    if selected_salespersons:
                        sp1 = c1.get("sales_person")
                        sp2 = c2.get("sales_person")
                        if not (sp1 in selected_salespersons or sp2 in selected_salespersons):
                            continue

                    if party_name_filter:
                        if not (main["name"] in party_name_filter or duplicate["name"] in party_name_filter):
                            continue

                    data.append({
                        "main_customer": main["name"],
                        "duplicate_customer": duplicate["name"],
                        "similarity": sim_token,
                        "sales_person": main.get("sales_person"),
                        "sales_person2": duplicate.get("sales_person")
                    })
                    used_as_duplicate.add(duplicate["name"])
    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data))) 
    return data