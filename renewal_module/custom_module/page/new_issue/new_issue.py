import frappe
@frappe.whitelist()
def get_support_page():
    """Return the rendered support page HTML."""
    html = frappe.render_template("renewal_module/templates/includes/support_page.html", {})
    return {"ok": True, "rendered_html": html}
