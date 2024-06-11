# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
def execute(filters=None):
    columns= get_columns()
    data_result = data(filters)
    return columns,data_result

def data(filters=None):
    conditions = ""
    values = {}

    if filters:
	    if filters.get("name"):
		    conditions += " AND so.name IN %(name)s"
		    values["name"]=filters['name']  
	    if filters.get("from"):
		    conditions += " AND so.transaction_date >= %(form)s"
		    values["form"]= filters["from"]
	    if filters.get("to"):
		    conditions += " AND so.transaction_date <= %(to)s"
		    values["to"]= filters["to"]
	    if filters.get("item"): 
		    conditions += " AND soi.item_code IN %(item)s"
		    values["item"]=filters['item']
	    if filters.get("item_group"):
		    conditions += " AND soi.item_group IN %(item_group)s "
		    values["item_group"] = filters['item_group']
	    if filters.get("brand"):
		    conditions += " AND soi.brand IN %(brand)s "
		    values["brand"] = filters['brand']	

    query = """ 
	  	SELECT 
			so.name AS sales_order_id,
			sq.name AS supplier_id,
			so.customer AS so_customer,
			sq.supplier AS sq_supplier,
			so.transaction_date AS so_transaction_date,
			soi.item_code AS soi_item_code,
			soi.item_group AS soi_item_group,
			soi.brand AS soi_brand,
			soi.qty AS soi_qty,
			soi.rate AS soi_rate,
			soi.amount AS soi_amount,
			si.rate AS purchase_rate,
			si.amount AS purchase_amount,
			soi.amount - si.amount AS difference_amount,
			cis.sales_person AS cis_sales_person
			
		FROM 
		   `tabSales Order` AS so
		LEFT JOIN (
			SELECT 
			   parent,
			   item_code,
			   item_name,
			   item_group,
			   brand,
			   qty,
			   rate,
			   amount,
			   description
			FROM    
				`tabSales Order Item`
			GROUP BY 
			   parent,item_code,description,qty,brand
		)AS soi ON so.name = soi.parent  
		LEFT JOIN `tabSales Team` AS cis ON so.name=cis.parent 
        
        LEFT JOIN `tabCustomer Order Form` AS c ON so.cof_id = c.name
		LEFT JOIN( 
			SELECT 
			   parent,
			   item_code,
			   item_name,
			   item_group,
			   brand,
			   qty,
			   rate,
			   amount,
			   description
			FROM    
				`tabCustomer Order Form Item`
			GROUP BY 
			   parent,item_code,description,qty,brand
		)AS ci ON	c.name = ci.parent
		    AND soi.item_name = ci.item_name
			AND soi.item_code = ci.item_code
			AND soi.qty = ci.qty 
			AND soi.description = ci.description

		LEFT JOIN `tabQuotation` AS q ON c.quotation_id = q.name
		LEFT JOIN(
			SELECT 
			   parent,
			   item_code,
			   item_name,
			   item_group,
			   brand,
			   qty,
			   rate,
			   amount,
			   description
			FROM    
				`tabQuotation Item` 
			GROUP BY 
			   parent,item_code,description,item_name,qty
		)AS qi ON	q.name = qi.parent
		    AND soi.item_name = qi.item_name
			AND soi.item_code = qi.item_code
			AND soi.qty = qi.qty 
			AND soi.description = qi.description

		LEFT JOIN `tabOpportunity` AS opp ON q.opportunity = opp.name
		LEFT JOIN (
			SELECT 
			   parent,
			   item_code,
			   item_name,
			   item_group,
			   brand,
			   qty,
			   rate,
			   amount,
			   description
			FROM    
				`tabOpportunity Item`
			GROUP BY 
			   parent,item_code,description,item_name,qty	 
		)AS oi ON opp.name = oi.parent
		    AND soi.item_name = oi.item_name
			AND soi.item_code = oi.item_code
			AND soi.qty = oi.qty 
			AND soi.description = oi.description	
			
		LEFT JOIN `tabSupplier Quotation` AS sq ON opp.name = sq.opportunity 
		LEFT JOIN `tabSupplier Quotation Item` AS si ON	sq.name = si.parent
		    AND soi.item_name = si.item_name
			AND soi.item_code = si.item_code
			AND soi.qty = si.qty 
			AND soi.description = si.description
        WHERE si.recommended_ =1 
		{}
		ORDER BY so.name,sq.supplier,soi.item_code,soi.qty,soi.rate ASC 
	""".format(conditions)
    data= frappe.db.sql(query, values, as_dict=True)
    return data	
	
def get_columns():
	return [
		{"label":"Sales Order Id","fieldname":"sales_order_id","fieldtype":"Link","options":"Sales Order","width":200},
		{"label":"Supplier Id","fieldname":"supplier_id","fieldtype":"Link","options":"Supplier Quotation","width":200},
		{"label":"Customer","fieldname":"so_customer","fieldtype":"Link","options":"Customer","width":200},
		{"label":"Supplier","fieldname":"sq_supplier","fieldtype":"Link","options":"Supplier","width":200},
		{"label":"Date","fieldname":"so_transaction_date","fieldtype":"Date","width":100},	
		{"label":"Item","fieldname":"soi_item_code","fieldtype":"Link","options":"Item","width":200},
		{"label":"Qty","fieldname":"soi_qty","fieldtype":"Float","width":100},
		{"label":"Rate","fieldname":"soi_rate","fieldtype":"Currency","width":100},
		{"label":"Amount","fieldname":"soi_amount","fieldtype":"Currency","width":100},
		{"label":"Purchase Rate","fieldname":"purchase_rate","fieldtype":"Currency","width":100},
		{"label":"Purchase Amount","fieldname":"purchase_amount","fieldtype":"Currency","width":100},
		{"label":"Difference Amount","fieldname":"difference_amount","fieldtype":"Currency","width":100},
		{"label":"Sales Person","fieldname":"cis_sales_person","fieldtype":"Link","options":"Sales Team","width":150},
	]	
