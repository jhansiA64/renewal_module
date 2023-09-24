from erpnext.setup.doctype.employee.employee import *
from frappe.utils.nestedset import NestedSet

from hrms.hr.doctype.employee.employee import *

@frappe.whitelist()
class EmployeeStatus(NestedSet):
    def validate(self):
        frappe.msgprint("hello")
		from erpnext.controllers.status_updater import validate_status

		validate_status(self.status, ["Active", "Inactive", "Suspended", "Left","No Calls,No Show"])

        self.employee = self.name
		self.set_employee_name()
		self.validate_date()
		self.validate_email()
		self.validate_status()
		self.validate_reports_to()
		self.validate_preferred_email()

		if self.user_id:
			self.validate_user_details()
		else:
			existing_user_id = frappe.db.get_value("Employee", self.name, "user_id")
			if existing_user_id:
				remove_user_permission("Employee", self.name, existing_user_id)
