# your_app/api.py
import frappe
from frappe.model.document import Document

@frappe.whitelist()
def get_user_report_settings(user_id, report_name):
    settings = frappe.get_all('UserReportSettings', filters={
        'user': user_id,
        'report_name': report_name
    }, fields=['hidden_columns'])
    return settings[0] if settings else {}

@frappe.whitelist()
def save_user_report_settings(user_id, report_name, hidden_columns):
    settings = frappe.get_all('UserReportSettings', filters={
        'user': user_id,
        'report_name': report_name
    }, fields=['name'])
    
    if settings:
        doc = frappe.get_doc('UserReportSettings', settings[0]['name'])
    else:
        doc = frappe.new_doc('UserReportSettings')
    
    doc.user = user_id
    doc.report_name = report_name
    doc.hidden_columns = hidden_columns
    doc.save(ignore_permissions=True)
