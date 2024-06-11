import frappe

def get_context(context):
    job_opening_name = frappe.form_dict.name
    if job_opening_name:
        context.job_opening = frappe.get_doc("Job Opening", job_opening_name)
    return context
