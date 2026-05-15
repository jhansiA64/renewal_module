import frappe
import re


OLD_BLOCK = """{% block navbar %}{% endblock %}"""
NEW_BLOCK = """{% block navbar %}
{% set selected_navbar = frappe.db.get_single_value(\"Website Settings\", \"navbar_template\") or \"Standard Navbar\" %}
{{ web_block(selected_navbar, values=_context_dict, add_container=0, add_top_padding=0, add_bottom_padding=0) }}
{% endblock %}"""
NAVBAR_BLOCK_PATTERN = re.compile(r"\{%\s*block\s+navbar\s*%\}(.*?)\{%\s*endblock\s*%\}", re.DOTALL)


def ensure_login_navbar_block():
    """Keep login navbar customization persistent across frappe upgrades."""
    login_template = frappe.get_app_path("frappe", "www", "login.html")

    try:
        with open(login_template, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        frappe.log_error("frappe/www/login.html not found", "ensure_login_navbar_block")
        return

    updated = None
    if NEW_BLOCK in content:
        return

    block_match = NAVBAR_BLOCK_PATTERN.search(content)
    if block_match:
        # Replace any existing navbar block (empty or custom) with the desired dynamic block.
        updated = NAVBAR_BLOCK_PATTERN.sub(NEW_BLOCK, content, count=1)
    elif OLD_BLOCK in content:
        updated = content.replace(OLD_BLOCK, NEW_BLOCK, 1)
    else:
        # If upstream template changes, inject navbar block right after extends line.
        marker = '{% extends "templates/web.html" %}'
        if marker in content:
            updated = content.replace(marker, marker + "\n" + NEW_BLOCK, 1)

    if not updated or updated == content:
        return

    with open(login_template, "w", encoding="utf-8") as f:
        f.write(updated)

    frappe.logger().info("Applied persistent login navbar customization.")
