import frappe
from frappe import _
from frappe.utils import now
from frappe.model.document import Document
from erpnext.crm.doctype.appointment.appointment import Appointment as CoreAppointment

class CustomAppointment(CoreAppointment):

    def after_insert(self):
        if self.party:
            self.auto_assign()
            # self.create_calendar_event()  # skipped
        else:
            self.status = "Unverified"
            self.send_confirmation_email()

    def set_verified(self, email):
        if not email == self.customer_email:
            frappe.throw(_("Email verification failed."))
        self.create_lead_and_link()
        self.status = "Open"
        self.auto_assign()
        # self.create_calendar_event()  # skipped
        self.save(ignore_permissions=True)
        frappe.db.commit()
