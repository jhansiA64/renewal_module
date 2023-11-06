# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from datetime import datetime
from dateutil import relativedelta



def execute(filters=None):
	session_user = frappe.session.user
	# if session_user == "Administrator":
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(session_user)))
	columns, data = get_columns(), get_data(filters)



	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data, None, chart, report_summary

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
			"fieldname":"age",
		    "label":_("Age"),
		    "fieldtype": "Float",		    
			"width":100
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
			"fieldname":"orc_amount",
			"label":_("ORC Amount"),
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
		{
			"fieldname":"target_amount",
			"label":_("Target Amount"),
			"fieldtype":"Currency",
			"width":150
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
			top.supplier,
			tsoi.item_code ,
			tsoi.item_group ,
            tsoi.brand ,
			tsoi.qty as sales_qty,
			tsoi.rate as sales_rate ,
			tsoi.amount as sales_amount,
			(CASE when top.p_qty IS NULL  then 0 
			else top.p_qty END )as purchase_qty ,
			(CASE when top.p_rate IS NULL  then 0 
			else top.p_rate END )as purchase_rate,
			(CASE when top.p_amount IS NULL  then 0 
			else top.p_amount END )as purchase_amount,
			(CASE when top.orc = 1 then torc.commission_amount
			else 0 END) as orc_amount,
			(CASE 
			when top.p_amount  IS NULL and torc.commission_amount IS not NULL  then tsoi.amount - torc.commission_amount
			when top.p_amount  IS NULL and torc.commission_amount IS NULL  then 0
			WHEN top.p_amount is not NULL and torc.commission_amount IS not NULL then (tsoi.amount - top.p_amount) - torc.commission_amount
			WHEN top.p_amount is not NULL and torc.commission_amount IS NULL then tsoi.amount - top.p_amount
			else 0  END )as profit ,
			tst.sales_person,
			tu.full_name as user,
			(DATEDIFF(%(to_date)s , %(from_date)s) + 1) AS age,
			(ttd.target_amount) as target_amount
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
	user = frappe.session.user
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(user)))
	# sales_user = frappe.db.sql("""SELECT tu.full_name FROM `tabUser` tu WHERE tu.email='{user}';""", as_dict= 1)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user)))


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
		conditions.append(" and top.supplier in %(supplier)s")	

	if filters.get("sales_person"):
		conditions.append(" and tst.sales_person in %(sales_person)s")	
	
	if filters.get("user") :
		if 'COF Approval' in frappe.get_roles(frappe.session.user) and 'System Manager' not in frappe.get_roles(frappe.session.user):
			conditions.append(" and tu.full_name = %(user)s")
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(conditions)))				

		

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """Left join `tabSales Order` tso on tsoi.parent = tso.name 
			Left join `tabQuotation Item` tqi on tsoi.prevdoc_docname = tqi.parent and tsoi.item_code = tqi.item_code and tsoi.qty = tqi.qty 
			left join (SELECT toi.parent as opportunity,toi.name , toi.item_code as s_item_code , toi.qty as s_qty ,tpq.name as sq_name, tpq.supplier as supplier,tpq.item_code as sq_item_code,
			toi.rate as s_rate , tpq.rate as p_rate ,tpq.qty as p_qty, tpq.amount as p_amount, toi.orc as orc, toi.description as description 
			from 
			`tabOpportunity Item` toi
			left join (SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate , tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity
			from `tabSupplier Quotation` tsq 
			left join (SELECT parent , item_code , rate, qty, amount   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1) as tsqi on tsqi.parent = tsq.name 
			) as tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty) as top on top.opportunity = tqi.prevdoc_docname and top.s_item_code = tqi.item_code and top.s_qty = tqi.qty
			LEFT JOIN 
			(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id, toi2.item_code as item_code , toi2.qty as qty ,
			toi2.rate as rate , toi2.description as description 
			FROM `tabORC Item` toi2 
			left join `tabORC List` tol on toi2.parent = tol.name
			WHERE tol.docstatus  = 1) as torc on  torc.opportunity_id = top.opportunity and top.s_item_code = torc.item_code 
			and top.s_qty = torc.qty and top.s_rate = torc.rate and top.description = torc.description
			LEFT JOIN `tabSales Team` tst on tsoi.parent = tst.parent
			LEFT JOIN `tabTarget Detail` ttd on ttd.parent = tst.sales_person
			LEFT JOIN `tabUser` tu on tst.sales_person = tu.full_name"""

	

	return join


def get_report_summary(filters,columns, currency, data):
	sales_user1 = filters.get("sales_person")
	d1 = filters.get("from_date")
	d2 = filters.get("to_date")
	start_date = datetime.strptime(d1, "%Y-%m-%d")
	end_date = datetime.strptime(d2, "%Y-%m-%d")	
	delta = relativedelta.relativedelta(end_date, start_date)
	months = delta.months + 1
	# frappe.msgprint("<pre>{}</pre>".format(months))

	sales_amount, purchase_amount = 0.0, 0
	fiscal_year = frappe.db.sql(f"""SELECT year_start_date , year_end_date  FROM `tabFiscal Year` tfy WHERE auto_created = 1""", as_dict=1)
	
	orc = 0
	target_list = []
	target_dict = {"Geetha Pudi":0,"Kavitha Pindi":0, "Salman Naved Mohammed":0}
	days = []
	target_amount = 0
	variance = 0

	if sales_user1:
		for period in data:
		
			sales_amount = sales_amount + float(period.profit)
			purchase_amount += period.purchase_amount
			
			if datetime.strptime(filters.get("from_date"), '%Y-%m-%d') >= datetime.strptime(str(fiscal_year[0].year_start_date),'%Y-%m-%d') and datetime.strptime(filters.get("to_date"), '%Y-%m-%d')<= datetime.strptime(str(fiscal_year[0].year_end_date),'%Y-%m-%d'):
				if period.target_amount not in target_list:
					target_list.append(period.target_amount)
				if "Salman Naved Mohammed" in period:
					if period.target_amount not in target_dict.values():
						target_dict["Salman Naved Mohammed"] = period.target_amount	
				if period.age not in days:
					days.append(period.age)	

		if target_list:
			
			
			if datetime.strptime(filters.get("from_date"), '%Y-%m-%d') == datetime.strptime(str(fiscal_year[0].year_start_date),'%Y-%m-%d') and datetime.strptime(filters.get("to_date"), '%Y-%m-%d')== datetime.strptime(str(fiscal_year[0].year_end_date),'%Y-%m-%d'):
				for a in target_list:
					target_amount += a
				# target_amount =  float(target_list[0])
								
				# variance= target_amount - sales_amount	
			else:
				diff_days = fiscal_year[0].year_end_date - fiscal_year[0].year_start_date
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(diff_days.days)))
				for a in target_list:
					target_amount += a
				target_amount = float(target_amount) * float(months)	/ 12
				# variance = target_amount - sales_amount
			variance= sales_amount - target_amount
		

	# target_amount = target_list[0]	
		

	
	sales_label = _("Sales Amount")
	purchase_label = _("Purchase Amount")
	orc_label = _("ORC Amount")
	round(sales_amount,2)
	round(purchase_amount,2)
	var_indicator= ""
	if variance >0:
		var_indicator = "#FBC543"
	else:
		var_indicator = "Red"


	return [
		{"value": round(target_amount, 2),"indicator": "Blue", "label": "Target Amount", "datatype": "Currency"},
		{"value": round(sales_amount,2),"indicator": "Green", "label": "Achieved", "datatype": "Currency"},		
		{"value":round(variance,2),"indicator": var_indicator, "label": "Variance", "datatype": "Currency"},
		
		
	]


def get_chart_data(filters, columns, data):
	sales_amount, purchase_amount = 0.0, 0.0
	fiscal_year = frappe.db.sql(f"""SELECT year_start_date , year_end_date  FROM `tabFiscal Year` tfy WHERE auto_created = 1""", as_dict=1)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
	labels = ["Sales Data"]
	target_list = []
	days = []
	target_amount = 0.0
	variance = 0.0

	for period in data:
		# frappe.msgprint(p)
		sales_amount += period.sales_amount
		purchase_amount += period.purchase_amount	

		if datetime.strptime(filters.get("from_date"), '%Y-%m-%d') >= datetime.strptime(str(fiscal_year[0].year_start_date),'%Y-%m-%d') and datetime.strptime(filters.get("to_date"), '%Y-%m-%d')<= datetime.strptime(str(fiscal_year[0].year_end_date),'%Y-%m-%d'):
			if period.target_amount not in target_list:
				target_list.append(period.target_amount)
			if period.age not in days:
				days.append(period.age)	

	if target_list:
		if datetime.strptime(filters.get("from_date"), '%Y-%m-%d') == datetime.strptime(str(fiscal_year[0].year_start_date),'%Y-%m-%d') and datetime.strptime(filters.get("to_date"), '%Y-%m-%d')== datetime.strptime(str(fiscal_year[0].year_end_date),'%Y-%m-%d'):
		    target_amount =  float(target_list[0])
			# variance= target_amount - sales_amount	
		else:
			diff_days = fiscal_year[0].year_end_date - fiscal_year[0].year_start_date
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(diff_days.days)))
			target_amount = float(target_list[0]) * float(days[0])	/(diff_days.days + 1)
			# variance = target_amount - sales_amount
		variance= sales_amount - target_amount
		

	round(sales_amount,2)
	round(target_amount,2)
	round(variance,2)

	datasets = [{"name":"Target Amount","values":[0.0]},
	{"name":"Achieved", "values":[0.0]},
	{"name":"Variance","values":[0.0]}
	]
	
	datasets[0]["values"] = [target_amount]
	datasets[1]["values"] = [sales_amount]
	datasets[2]["values"] = [variance]

	var_indicator= ""
	if variance >0:
		var_indicator = "#145214"
	else:
		var_indicator = "Red"
	

	
	return {
        'title':"Chart Based On Sales",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'fieldtype':'Currency',
		'colors':["#0087AC","#82C272",var_indicator],
    }



