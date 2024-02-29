import frappe
from frappe import auth

def get_renewals(doc,event):
    
    doc.set("active_renewals", [])
    doc.set("new_renewals", [])
    
    active_list = frappe.db.get_list("Renewal List",filters={"customer_name":doc.name,"status":"Active"},fields=['name'],page_length="*",order_by="creation ASC")
    if active_list:
        for each in active_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            doc.append("active_renewals",{
                'item' : each_data.product_name,
                'quantity': each_data.total_quantity,
                'start_date':each_data.start_date,
                'end_date':each_data.end_date,
                'renewal_id':each_data.name
            })
    new_list = frappe.db.get_list("Renewal List",filters={"customer_name":doc.name,"status":"New Opp"},fields=['name'],page_length="*",order_by="creation ASC")
    if new_list:
        for each in new_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            doc.append("new_renewals",{
                'item' : each_data.product_name,
                'quantity': each_data.total_quantity,
                'start_date':each_data.start_date,
                'end_date':each_data.end_date,
                'renewal_id':each_data.name
            })
def get_margin(doc,event):
    
    doc.set("margin_table", [])
    
    
    # active_list = frappe.db.get_list("Renewal List",filters={"customer_name":doc.name,"status":"Active"},fields=['name'],page_length="*",order_by="creation ASC")
    for each in doc.items:
        frappe.msgprint(each.base_amount)
        # each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
        #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each.item_code)))
        doc.append("margin_table",{
            'item_code' : each.item_code,
            'qty': each.qty,
            'selling_rate':each.rate,
            'buying_rate':each.purchase_rate,
            'selling_amount':each.amount,
            'buying_amount':each.purchase_amount,
            'margin':each.margin_amount,
            'cof_item_id':each.name
            
        })


def get_transactions(doc,event):
    doc.set("custom_invoice_details", [])
    
    invoice_list = frappe.db.sql(f"""
        SELECT tol.name as orc_id,tol.pan_number as pan_number , 
        tol.status, 
        tsin.posting_date,
        tol.sub_total ,
        tol.tds_tax ,
        tsin.invoice as s_invoice, 
        (CASE when tsin.grand_total IS Not Null then tsin.grand_total
        else 0 end) as grand_total, 
        (CASE when tsin.due_amount IS Not Null then tsin.due_amount
        else 0 end) as due_amount  
        FROM `tabORC List` tol 
        left join `tabOpportunity` to2  on tol.opportunity_id = to2.name 
        LEFT JOIN `tabQuotation` tq on tq.opportunity = to2.name 
        LEFT JOIN (SELECT tso.name as name , tsoi.item_code, tso.base_total  ,tsoi.rate ,tsoi.prevdoc_docname as quote_id  
        FROM `tabSales Order` tso 
        inner join `tabSales Order Item` tsoi on tso.name = tsoi.parent 
        group by tso.name ) as tsor on tsor.quote_id = tq.name  
        LEFT JOIN (SELECT tsi.name as invoice,tsi.posting_date as posting_date , tsii.item_code, tsi.grand_total as grand_total  ,tsi.outstanding_amount as due_amount ,tsii.sales_order as so_id  
        FROM `tabSales Invoice` tsi  
        inner join `tabSales Invoice Item` tsii on tsi.name = tsii.parent 
        group by tsi.name ) as tsin on tsin.so_id = tsor.name
        WHERE tol.sales_partner = '{doc.name}' and tol.workflow_state Not IN ("Draft","Duplicate") and tq.status != "Draft"
        """,as_dict = 1)

    if invoice_list:
        total_amount = 0
        total_paid = 0
        total_outstanding = 0
        for each in invoice_list:
                       
            # frappe.msgprint(each")
            # each_data = frappe.db.get_value("Renewal List",each.name,['product_name','total_quantity','start_date','end_date','name'],as_dict=1)
            #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each)))
            
            total_amount += each.grand_total
            # total_paid = 0
            total_outstanding += each.due_amount
            doc.append("custom_invoice_details",{
                'orc_id' : each.orc_id,
                'pan_number': each.pan_number,
                'posting_date':each.posting_date,
                'amount':each.grand_total,
                'outstanding_amount':each.due_amount,
                'invoice_no':each.s_invoice,
            })
        doc.custom_total_invoice_amount =  total_amount
        doc.custom_total_paid_amount = total_amount- total_outstanding
        doc.custom_outstanding_amount = total_outstanding  
    else:
        frappe.msgprint("No Data Available")   
    
    get_orc_details(doc,event)         

def get_orc_details(doc,event):
    doc.set("custom_orc_transaction_details", [])
    
    orc_list = frappe.db.sql(f"""
    SELECT tol.name as orc_id, tol.pan_number as pan_number, 
    tol.sub_total as sub_total , tol.grand_total as grand_total , 
    tol.tds_tax as tds ,tol.creation as date,tol.status as status,
    (CASE when tje.total_debit IS NOT NUll then sum(tje.total_debit)
    else 0  end) as  paid_amount,
    (CASE when tje.total_debit IS NOT NUll then tol.sub_total - sum(tje.total_debit)
    else tol.sub_total  end) as outstanding_amount
    FROM `tabORC List` tol 
    left join `tabJournal Entry` tje on tol.name = tje.orc_id and tol.pan_number = tje.pan_number 
    where tol.sales_partner = '{doc.name}' and tol.workflow_state Not IN ("Draft","Duplicate")
    GROUP BY tol.name
    """,as_dict=1)

    fiscal_year = frappe.db.sql(f"""
    SELECT year, year_start_date, year_end_date from `tabFiscal Year` tfy 
    WHERE auto_created = 1;
    """,as_dict=1)
    
    if orc_list:
        total_amount = 0
        total_paid = 0
        total_outstanding = 0
        for each in orc_list:
            # frappe.msgprint(each.name)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            date1 = each.date
            date2 = date1.date()
            total_amount += each.sub_total
            total_outstanding += each.outstanding_amount 

            doc.append("custom_orc_transaction_details",{
                'orc_id' : each.orc_id,
                'pan_number': each.pan_number,
                'sub_total':each.sub_total,
                'grand_total':each.sub_total - each.tds,
                'tds':each.tds,
                'paid_amount':each.paid_amount,
                'outstanding_amount':each.outstanding_amount,
                'created_date':date2,
                'fiscal_year':fiscal_year[0].year,
                'status':each.status
            })
        doc.custom_total_orc_amount = total_amount
        doc.custom_total_orc_paid_amount = total_amount - total_outstanding
        doc.custom_total_orc_outstanding = total_outstanding   
