# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _



def execute(filters=None):
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
			"fieldname":"transaction_date",
			"label":_("Sales Order Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"label": _("Sales order"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Sales Order",
			"width": 170,
		},
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Dynamic Link",
			"options": "sales_order_from",
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
			"fieldname":"profit",
			"label":_("Profit"),
			"fieldtype":"Currency",
			"width":150
		},		
		
		
		{
			"label": _("TDS"),
			"fieldname": "tds",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"label": _("ORC Amount"),
			"fieldname": "orc_amount",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"label": _("Commission"),
			"fieldname": "commission",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
	]
	return columns


def get_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			tso.transaction_date ,
			tso.name ,
			tso.customer ,
			tsq.supplier,
			tsoi.item_code ,
			tsoi.item_group ,
            tsoi.brand ,
			tsoi.qty as sales_qty,
			tsoi.rate as sales_rate ,
			tsoi.amount as sales_amount,
			tsqi.qty as purchase_qty,
			MIN(tsqi.rate) as purchase_rate,
			MIN(tsqi.amount) as purchase_amount,
			(CASE when tsqi.amount IS NULL  then tsoi.amount 
			else tsoi.amount - MIN(tsqi.amount) END )as profit, 
			(CASE when tol.name IS NULL then "0"
			else tol.tds_tax END)as tds , 
			(CASE when tol.name IS NULL then "0"
			else tol.sub_total END)as orc_amount,
			(CASE when tol.name IS NULL then "0"
			else tol.grand_total END)as commission,
			
			tst.sales_person
		FROM
			`tabSales Order Item` tsoi
			{join}
		WHERE
			tso.company = %(company)s
			AND DATE(tso.transaction_date) BETWEEN %(from_date)s AND %(to_date)s
			{conditions}
		GROUP BY tsoi.name	
		
		ORDER BY
			tso.name ASC """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)


def get_conditions(filters):
	conditions = []

	if filters.get("sales_order"):
		conditions.append(" and tso.name=%(sales_order)s")

	if filters.get("item_code"):
		conditions.append(" and tsoi.item_code=%(item_code)s")

	if filters.get("item_group"):
		conditions.append(" and tsoi.item_group in %(item_group)s")

	if filters.get("brand"):
		conditions.append(" and tsoi.brand in %(brand)s")		

	if filters.get("customer"):
		conditions.append(" and tso.customer in %(customer)s")
	if filters.get("supplier"):
		conditions.append(" and tsq.supplier in %(supplier)s")	

	if filters.get("sales_person"):
		conditions.append(" and tst.sales_person in %(sales_person)s")	

		

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """left join `tabSales Order` tso on tsoi.parent = tso.name 
			LEFT JOIN `tabQuotation Item` tqi on tsoi.prevdoc_docname = tqi.parent 
			LEFT JOIN `tabOpportunity Item` toi on tqi.prevdoc_docname = toi.parent
			LEFT JOIN `tabSupplier Quotation` tsq on tsq.opportunity = toi.parent 
			LEFT JOIN `tabSupplier Quotation Item` tsqi on tsq.name = tsqi.parent  and tsqi.item_code = tsoi.item_code
			LEFT JOIN `tabORC List` tol on tol.opportunity_id = toi.parent 
			LEFT JOIN `tabORC Item` toi2 on toi2.parent = tol.name and toi2.item_code = toi.item_code 
			LEFT JOIN `tabSales Team` tst on tsoi.parent = tst.parent """

	

	return join