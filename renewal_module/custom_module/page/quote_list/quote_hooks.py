# renewal_module/custom_module/quotation_hooks.py
import frappe
from frappe import _

def validate_payment_terms_approval(doc, method):
    """Block status change from Draft, and block submit, if payment terms
    require approval and no matching Active approval exists."""

    needs_approval = _payment_terms_need_approval(doc)
    if not needs_approval:
        return

    approval = frappe.db.get_value(
        "Payment Terms Approval",
        {"quotation": doc.name, "status": "Active"},
        ["advance_pct", "on_delivery_pct", "after_delivery_pct",
         "on_delivery_days", "after_delivery_days"],
        as_dict=True,
    )

    current = _current_payment_term_values(doc)

    if not approval or not _values_match(approval, current):
        frappe.throw(
            _("This quotation's payment terms split across all three milestones "
              "(Advance / On Delivery / After Delivery) and require approval before "
              "the status can change or the document can be submitted. "
              "Please approve the current payment terms first."),
            title=_("Approval Required")
        )


def _payment_terms_need_approval(doc):
    cpt = {row.type: row for row in (doc.custom_payment_terms or [])}
    pct = cpt.get("Percentage")
    if not pct:
        return False
    vals = [
        frappe.utils.flt(pct.advance),
        frappe.utils.flt(pct.on_delivery),
        frappe.utils.flt(pct.after_delivery),
    ]
    return len([v for v in vals if v > 0]) >= 3


def _current_payment_term_values(doc):
    cpt = {row.type: row for row in (doc.custom_payment_terms or [])}
    pct = cpt.get("Percentage")
    days = cpt.get("Days")
    return {
        "advance_pct": frappe.utils.flt(pct.advance) if pct else 0,
        "on_delivery_pct": frappe.utils.flt(pct.on_delivery) if pct else 0,
        "after_delivery_pct": frappe.utils.flt(pct.after_delivery) if pct else 0,
        "on_delivery_days": frappe.utils.cint(days.on_delivery) if days else 0,
        "after_delivery_days": frappe.utils.cint(days.after_delivery) if days else 0,
    }


def _values_match(approval, current):
    return (
        frappe.utils.flt(approval.advance_pct) == current["advance_pct"]
        and frappe.utils.flt(approval.on_delivery_pct) == current["on_delivery_pct"]
        and frappe.utils.flt(approval.after_delivery_pct) == current["after_delivery_pct"]
        and frappe.utils.cint(approval.on_delivery_days) == current["on_delivery_days"]
        and frappe.utils.cint(approval.after_delivery_days) == current["after_delivery_days"]
    )