
import frappe

def get_context(context):
    user_email = frappe.session.user

    # Administrator logic
    if user_email == "Administrator":
        context.doc = frappe.get_all(
            "Address",
            fields=["*"],
            order_by="creation desc"
            # limit_page_length=20
        )
        context.message = "Showing all Address lists as Administrator."
        return context

    # Guest logic
    if user_email == "Guest":
        context.doc = []
        context.message = "Please log in to view address lists."
        return context

    # Logic for logged-in users
    contact_name = frappe.db.get_value("Contact", {"email_id": user_email}, "name")
    if contact_name:
        # Fetch the linked Customer for the logged-in Contact
        customer = frappe.db.get_value(
            "Dynamic Link",
            {"parenttype": "Contact", "parent": contact_name, "link_doctype": "Customer"},
            "link_name"
        )
    else:
        customer = None

    if customer:
        # Fetch addresses specifically linked to the customer
        query = """
            SELECT 
                addr.name,addr.address_title, addr.address_line1, addr.address_line2, addr.city,addr.disabled, 
                addr.state, addr.country, addr.pincode,addr.email_id,addr.phone,addr.fax,addr.tax_category
            FROM 
                `tabAddress` AS addr
            INNER JOIN 
                `tabDynamic Link` AS dl 
            ON 
                dl.parent = addr.name
            WHERE 
                dl.link_doctype = 'Customer' AND dl.link_name = %s AND addr.disabled = 0
            ORDER BY 
                addr.creation DESC
            
        """
        context.doc = frappe.db.sql(query, (customer,), as_dict=True)
        context.customer_name = customer
        context.message = f"Showing address lists for customer: {customer}."
    else:
        context.doc = []
        context.message = "You are not authorized to view address lists."

    return context




