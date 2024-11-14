# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from datetime import datetime
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta



def execute(filters=None):
	session_user = frappe.session.user
	# if session_user == "Administrator":
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(session_user)))
	columns, data = get_columns(), get_data(filters)



	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	# chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data, None

def get_columns():
	columns = [
		{
			"fieldname":"posting_date",
			"label":_("Sales Invoice Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"label": _("Sales Invoice"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 170,
		},
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Dynamic Link",
			"options": "sales_invoice_from",
			"width": 160,
		},
		{
			"label": _("Status"),
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"fieldname":"posting_date",
		    "label":_("Posting Date"),
		    "fieldtype": "Data",
		    
			"width":200
		},
		{
			"fieldname":"due_date",
		    "label":_("Due Date"),
		    "fieldtype": "Data",
		    
			"width":200
		},
		{
			"fieldname":"age",
		    "label":_("Age"),
		    "fieldtype": "Int",		    
			"width":100
		},
		
		
        
		{
			"fieldname":"total_amount",
			"label":_("Total Amount"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"paid_amount",
			"label":_("Paid Amount"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"tds",
			"label":_("TDS"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"outstanding_amount",
			"label":_("Outstanding Amount"),
			"fieldtype":"Data",
			"width":150
		},
		
		
				
		
		
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
		{
			"label": _("Button"),
			"fieldname": "name1",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("View Button"),
			"fieldname": "name2",
			"fieldtype": "Data",
			"width": 150,
		},
			
	]
	return columns


def get_data(filters):
	
	return frappe.db.sql(
		"""
		SELECT
			`tabSales Invoice`.posting_date ,
			`tabSales Invoice`.name ,`tabSales Invoice`.status ,
			`tabSales Invoice`.customer ,
			`tabSales Invoice`.posting_date ,
			`tabSales Invoice`.due_date,
			DATEDIFF(now() , `tabSales Invoice`.posting_date) AS age,
			(CASE when `tabSales Invoice`.disable_rounded_total != 1 then `tabSales Invoice`.rounded_total
			else `tabSales Invoice`.grand_total END )as total_amount,
			(case when `tabSales Invoice`.disable_rounded_total != 1 and tje.total_credit >0 then `tabSales Invoice`.rounded_total  - `tabSales Invoice`.outstanding_amount - tje.total_credit
			when `tabSales Invoice`.disable_rounded_total != 1 then `tabSales Invoice`.rounded_total  - `tabSales Invoice`.outstanding_amount
			when `tabSales Invoice`.disable_rounded_total != 0 and tje.total_credit >0 then `tabSales Invoice`.grand_total  - `tabSales Invoice`.outstanding_amount - tje.total_credit 
			else `tabSales Invoice`.grand_total- `tabSales Invoice`.outstanding_amount End) as paid_amount ,
			(CASE when tje.total_credit > 0  then tje.total_credit 
			else 0
			End)as tds,
			`tabSales Invoice`.outstanding_amount ,
			tst.sales_person
			
		FROM
			`tabSales Invoice` 
			{join}
		WHERE
			`tabSales Invoice`.company = %(company)s
			{conditions}
		GROUP BY `tabSales Invoice`.name	
		
		ORDER BY
			`tabSales Invoice`.name ASC """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)


def get_conditions(filters):
	conditions = []
	user = frappe.session.user
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(user)))
	# sales_user = frappe.db.sql("""SELECT tu.full_name FROM `tabUser` tu WHERE tu.email='{user}';""", as_dict= 1)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user)))


	if filters.get("sales_invoice"):
		conditions.append(" and `tabSales Invoice`.name=%(sales_invoice)s")

	if filters.get("timespan") != "custom":
		if filters.get("timespan") == "this year":
			date = frappe.db.get_value("Fiscal Year",{'auto_created':1},["year_start_date","year_end_date"])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
		date_range = get_timespan_date_range(filters.get("timespan")) 
		date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date1)))
		conditions.append(f" and `tabSales Invoice`.posting_date >= '{date1}' and `tabSales Invoice`.posting_date <= '{date2}'")

	if filters.get("timespan") == "custom":
		
		conditions.append(" and `tabSales Invoice`.posting_date >= %(from_date)s and `tabSales Invoice`.posting_date <= %(to_date)s")
	
		

			

	if filters.get("customer"):
		conditions.append(" and `tabSales Invoice`.customer in %(customer)s")
	
	if filters.get("sales_person"):
		conditions.append(" and tst.sales_person in %(sales_person)s")	
	
	# if filters.get("user") :
	# 	if 'COF Approval' in frappe.get_roles(frappe.session.user) and 'System Manager' not in frappe.get_roles(frappe.session.user):
	# 		conditions.append(" and tu.full_name = %(user)s")		

		

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """left join `tabSales Team` tst on tst.parent = `tabSales Invoice`.name 
           left JOIN `tabJournal Entry Account` tjea on tjea.reference_type = 'Sales invoice' and tjea.reference_name =`tabSales Invoice`.name
           left JOIN `tabJournal Entry` tje on tje.name = tjea.parent """

	

	return join


