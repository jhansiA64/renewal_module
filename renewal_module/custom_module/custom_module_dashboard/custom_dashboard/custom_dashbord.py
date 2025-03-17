import frappe
from frappe.website.page_renderers.base import BasePage

class CustomDashboard(BasePage):
    def get_context(self, context):
        # Query for the sales data
        sales_data = frappe.db.get_all('Sales Invoice', fields=['sales_person', 'grand_total'])

        # Query for the monthly sales data (example)
        chart_data = frappe.db.get_all('Sales Invoice', fields=['month(date) as month', 'sum(grand_total) as total_sales'], group_by='month(date)')

        # Pass the data to the template
        context.sales_data = sales_data
        context.chart_data = chart_data

        # Set a title or any other context variables
        context.title = 'Custom Dashboard'

        return context
