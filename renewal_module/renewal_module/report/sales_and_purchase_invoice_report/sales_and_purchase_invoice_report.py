# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _



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
	
	
	return columns, data

def get_columns():
	columns = [
		{
			"fieldname":"posting_date",
			"label":_("Sales invoice Date"),
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
			"label": _("Supplier"),
			"fieldname": "supplier",
			"fieldtype": "Dynamic Link",
			"options": "purchase_order_from",
			"width": 160,
		},
		{
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 130,
		},
		{
			"label": _("Item group"),
			"fieldname": "item_group",
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 130,
		},
		{
			"label": _("Brand"),
			"fieldname": "brand",
			"fieldtype": "Link",
			"options": "Brand",
			"width": 130,
		},
        
		{
			"fieldname":"sales_qty",
		    "label":_("Sales Qty"),
		    "fieldtype": "Float",		    
			"width":100
		},
		{
			"fieldname":"sales_rate",
		    "label":_("Sales Rate"),
		    "fieldtype": "Float",		    
			"width":100
		},
		
		{
			"fieldname":"sales_amount",
		    "label":_("Sales Amount"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"s_date",
			"label":_("Start Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"fieldname":"e_date",
			"label":_("End Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"fieldname":"year_end_date",
			"label":_("Year End Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"fieldname":"purchase_qty",
		    "label":_("Purchase Qty"),
		    "fieldtype": "Float",		    
			"width":100
		},
		{
			"fieldname":"purchase_rate",
		    "label":_("Purchase Rate"),
		    "fieldtype": "Float",		    
			"width":100
		},
		
		{
			"fieldname":"purchase_amount",
		    "label":_("Purchase Amount"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"days",
			"label":_("Days"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"profit",
			"label":_("Profit"),
			"fieldtype":"Currency",
			"width":150
		},		
		
		
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
		{
			"fieldname":"user",
		    "label":_("User"),
		    "fieldtype": "Data",
			"width":250
		},
	]
	return columns


def get_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			tsi.posting_date ,
			tsi.name ,
			tsi.customer ,
			tpo.supplier,
			tsii.item_code ,
			tsii.item_group ,
            tsii.brand ,
			tsii.qty as sales_qty,
			tsii.rate as sales_rate ,
			tsii.amount as sales_amount,
			tsii.start_date as s_date,
			tsii.end_date as e_date,
			(SELECT year_end_date from `tabFiscal Year` tfy WHERE auto_created = 1) as year_end_date,
			(CASE when tsii.item_group  IN ("Email Solutions" ,"Antispam") then
				CASE 
					When tsii.payment_cycle = "Monthly" THEN 
						CASE 
							When tpoi.payment_cycle = "Half Yearly" Then ROUND(tpoi.rate/6)
							When tpoi.payment_cycle = "Quarterly" Then ROUND(tpoi.rate / 3 )
							When tpoi.payment_cycle = "Yearly" Then ROUND(tpoi.rate /12,2)
						Else tpoi.rate  END 
					When tsii.payment_cycle = "Quarterly" THEN 
						CASE 
							When tpoi.payment_cycle = "Half Yearly" Then tpoi.rate/2 
							When tpoi.payment_cycle = "Monthly" Then tpoi.rate * 3
							When tpoi.payment_cycle = "Yearly" Then tpoi.rate /4
						Else tpoi.rate End 
					When tsii.payment_cycle = "Half Yearly" THEN
						CASE 
							When tpoi.payment_cycle = "Quarterly" Then tpoi.rate * 2 
							When tpoi.payment_cycle = "Monthly" Then tpoi.rate * 6 
							When tpoi.payment_cycle = "Yearly" Then tpoi.rate / 2
						Else tpoi.rate End 
					When tsii.payment_cycle = "Yearly" THEN 
						CASE 
							When  tpoi.payment_cycle = "Half Yearly" Then tpoi.rate * 2
							When tpoi.payment_cycle = "Monthly" Then tpoi.rate * 12 
							When tpoi.payment_cycle = "Quarterly" Then tpoi.rate * 4
						Else tpoi.rate End      
				ELSE tpoi.rate END
			else 1 End) as purchase_rate,
			(CASE when tpoi.qty IS NULL  then 0 
			else tpoi.qty END )as purchase_qty ,
			(CASE when tpii.amount IS NULL  then 0 
			else tpii.net_amount END )as purchase_amount,
			DATEDIFF((Select year_end_date from `tabFiscal Year` where auto_created = 1 ) , tsii.end_date) AS days,
			(CASE when tpii.amount IS NULL  then tsii.amount 
			else tsii.amount - tpii.net_amount END )as profit ,
			tst.sales_person,
			tu.full_name as user
		FROM
			`tabSales Invoice Item` tsii
			{join}
		WHERE
		    tsi.company = %(company)s
			AND DATE(tsi.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			{conditions}
		GROUP BY tsii.name	
		
		ORDER BY
			tsi.name ASC """.format(
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
		conditions.append(" and tsi.name=%(sales_invoice)s")

	if filters.get("item_code"):
		conditions.append(" and tsii.item_code=%(item_code)s")

	if filters.get("item_group"):
		conditions.append(" and tsii.item_group in %(item_group)s")

	if filters.get("brand"):
		conditions.append(" and tsii.brand in %(brand)s")		

	if filters.get("customer"):
		conditions.append(" and tsi.customer in %(customer)s")
	if filters.get("supplier"):
		conditions.append(" and top.supplier in %(supplier)s")	

	if filters.get("sales_person"):
		conditions.append(" and tst.sales_person in %(sales_person)s")	
	
	if filters.get("user") :
		if 'COF Approval' in frappe.get_roles(frappe.session.user) and 'Administrator' not in frappe.get_roles(frappe.session.user) and 'System Manager' not in frappe.get_roles(frappe.session.user):
			conditions.append(" and tu.full_name = %(user)s")		

		

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """left join `tabSales Invoice` tsi on tsii.parent = tsi.name 
	        LEFT JOIN `tabSales Order` tso on tsi.sales_order  = tso.name
			left join `tabSales Order Item` tsoi on tsii.sales_order = tsoi.parent and tsii.item_code = tsoi.item_code and tsoi.description = tsii.description and tsoi.qty= tsii.qty
            left join `tabPurchase Order Item` tpoi on tpoi.sales_order = tsoi.parent and tsoi.item_code = tpoi.item_code and tsoi.description = tpoi.description and tsoi.qty= tpoi.qty
			left join `tabPurchase Order` tpo on tpoi.parent = tpo.name
            left JOIN `tabPurchase Invoice Item` tpii on tpii.purchase_order = tpoi.parent and tpoi.item_code =tpii.item_code and tsoi.description = tpoi.description and tpii.qty= tpoi.qty
            LEFT JOIN `tabSales Team` tst on tsii.parent = tst.parent
			LEFT JOIN `tabUser` tu on tst.sales_person = tu.full_name"""

	

	return join