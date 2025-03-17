# custom_api/api/customer.py
import frappe
from frappe import _

@frappe.whitelist(allow_guest=True)  # Allow guest access, but you can adjust this depending on your needs
def get_customer_details_by_email(contact_email):
    try:
        frappe.msgprint(contact_email)
        # Step 1: Find the Contact record using the email
        contact = frappe.get_all("Contact", filters={"email_id": contact_email}, fields=["name", "company_name"])

        # Check if contact exists and has a linked customer
        if not contact:
            return {"error": "No Contact found with this email ID."}
        
        contact_name = contact[0].get("name")
        customer_name = contact[0].get("company_name")
        
        # Step 2: Fetch the linked Customer record
        if not customer_name:
            return {"error": f"No Customer linked to Contact: {contact_name}"}
        
        customer = frappe.get_doc("Customer", customer_name)
        
        # Step 3: Return Customer details
        return {
            "customer_name": customer.customer_name,
            
        }

    except Exception as e:
        # Handle any errors during the process
        return {"error": str(e)}
