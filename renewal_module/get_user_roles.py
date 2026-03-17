import frappe
from frappe.utils import get_fullname

@frappe.whitelist()
def get_user_roles(user):
    user_doc = frappe.get_doc("User", user)
    full_name = get_fullname(user)
    image = user_doc.user_image or ""
    role_profile = user_doc.role_profile_name or ""

    roles = frappe.get_all("Has Role", filters={"parent": user}, fields=["role"])
    role_names = [r["role"] for r in roles]

    return {
        "full_name": full_name,
        "image": image,
        "roles": role_names,
        "role_profile": role_profile
    }