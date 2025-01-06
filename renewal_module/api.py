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

##cof margin table code
import json 
import frappe

@frappe.whitelist()
def update_margin_table(doc,method=None):
    try:
        # frappe.msgprint(customer_order_form)
        # doc=frappe.get_doc("Customer Order Form",customer_order_form)
        # frappe.msgprint(f"loaded cof number:{doc.name}")

        margin_updated = False

        for item in doc.items:
            actual_item_code = item.item_code
            # frappe.msgprint(f"processing item:{actual_item_code},rate:{item.rate},amount:{item.amount}")
            existing_margin_entry = None

            for margin_entry in doc.margin_table:
                # frappe.msgprint(f"margin entry item:{margin_entry.item_code}")
                if margin_entry.cof_item_id == item.name:
                    # frappe.msgprint(f"margin entry item:{margin_entry.item_code}")
                    existing_margin_entry = margin_entry
                    break

            if existing_margin_entry :
                if (existing_margin_entry.selling_rate != item.rate or 
                existing_margin_entry.selling_amount !=item.amount or 
                existing_margin_entry.buying_rate != item.purchase_rate or 
                existing_margin_entry.buying_amount != item.purchase_amount or 
                existing_margin_entry.orc_amount != item.orc_amount or 
                existing_margin_entry.margin != item.margin_amount or 
                existing_margin_entry.qty != item.qty or 
                existing_margin_entry.cof_item_id != item.name):
                #    frappe.msgprint(f"updating margin entry for item:{actual_item_code}")
                   existing_margin_entry.selling_rate = item.rate
                   existing_margin_entry.selling_amount = item.amount
                   existing_margin_entry.buying_rate = item.purchase_rate
                   existing_margin_entry.buying_amount = item.purchase_amount
                   existing_margin_entry.orc_amount = item.orc_amount
                   existing_margin_entry.margin = item.margin_amount
                   existing_margin_entry.cof_item_id = item.name
                   existing_margin_entry.qty = item.qty

                   margin_updated = True


            else:
                # frappe.msgprint(f"creating new marginentry for item:{actual_item_code}")
                margin_entry = {
                    'item_code':actual_item_code,
                    'selling_rate':item.rate,
                    'selling_amount':item.amount,
                    'buying_rate':item.purchase_rate,
                    'buying_amount':item.purchase_amount,
                    'orc_amount':item.orc_amount,
                    'margin':item.margin_amount,
                    'cof_item_id':item.name
                }            
                doc.append('margin_table',margin_entry)
                margin_updated = True

        if margin_updated:
            # frappe.msgprint("changes detected.saving document")
            doc.save(ignore_permissions=True)

            frappe.db.commit()
            # frappe.msgprint("margin table updated successfully") 

    except Exception as e:
        frappe.log_error(frappe.get_traceback(),"updated margin table error")   
        # frappe.msgprint(f"An Error occcured:{str(e)}")     



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



from frappe.model.document import Document
import frappe
import pytz

# class EventRegistration(Document):
# 	pass


def email_on_approval(doc,method):
	frappe.msgprint("approval function trigger")
	frappe.msgprint(f"Current Workflow State: '{doc.workflow_state}'")

	if doc.workflow_state == 'Approved':
		frappe.msgprint("approved sales user")
		send_approval_email(doc)


def send_approval_email(doc):
	frappe.msgprint("sending email")
	event_doc = frappe.get_doc("Event", doc.event_name)
	event_link = event_doc.custom_event_link
	event_venue = event_doc.custom_venue
	event_subject = event_doc.subject
	starts_on = event_doc.starts_on
	ist_timezone = pytz.timezone('Asia/Kolkata')
	starts_on_ist = starts_on.astimezone(ist_timezone)
	formatted_date = starts_on_ist.strftime('%A, %B %d,%Y')
	formatted_date1 = starts_on_ist.strftime('%I:%M %p IST')
	recipients = [doc.email]
	subject = f"Event Approved: {event_subject}"

	if event_link is not None:
		message = f"""
			<div style="font-family:Arial,sans-serif;margin:0;padding:0;background-color:#f4f4f4;">
				<div style="width:100%;max-width:600px;margin:10px auto;background-color:#ffffff;padding:20px;border-radius:8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<div style="background-color:#EA8300;padding:5px;color:#ffffff;justify-content:space-between;">
						<h2 style="text-align:center">64Network Security Pvt Ltd </h2>
						<h2 style="text-align:center">{event_subject}</h2>
					</div>

					<div style="margin:20px 0;">
						<h3 style="color:#333333;">Thank you for registering! </h3>
						<p style="color:#666666;line-height:1.5;">Save this email for details on the webcast </p>
						<p style="color:#666666;line-height:1.5;">creating a dynamic inbox with Embedded video in Email </p> 	
						<p style="color:#666666;line-height:1.5;"><strong>Live Webcast Date:</strong>{formatted_date} </p>
						<p style="color:#666666;line-height:1.5;"><strong>Live Webcast Time:</strong>{formatted_date1}</p>
						<p style="color:#666666;line-height:1.5;">use the link below to enter the webcast up to 15 minutes before the start </p>
						<p style="color:#666666;line-height:1.5;"><strong>Webcast Link:</strong><a href="{doc.link}" style="color:#1a73e8;text-decoration:none;">{event_link}</a></p>
						<p style="color:#666666;line-height:1.5;"><strong>System Test:</strong> Test your computer to make sure you meet the minimum technical requirements. Test your system</p>
						<br>
						<p style="color:#666666;line-height:1.5;">Thank you and enjoy the Webcast! </p>
					</div>

					<div style="padding:10px 20px; background-color:#f4f4f4;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;color:#888888;font-size:12px;">
						<p style="margin:0;">&copy;2024 64 Network Pvt Ltd. All rights reserved.</p>
					</div>
				</div>
			</div>
		"""
	elif event_venue is not None:
		message = f"""
			<div style="font-family:Arial,sans-serif;margin:0;padding:0;background-color:#f4f4f4;">
				<div style="width:100%;max-width:600px;margin:10px auto;background-color:#ffffff;padding:20px;border-radius:8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<div style="background-color:#EA8300;padding:5px;color:#ffffff;justify-content:space-between;">
						<h2 style="text-align:center">64Network Security Pvt Ltd </h2>
						<h2 style="text-align:center">{event_subject}</h2>
					</div>

					<div style="margin:20px 0;">
						<h3 style="color:#333333;">Thank you for registering! </h3>
						<p style="color:#666666;line-height:1.5;">Please save this email for important event details: </p> 	
						<p style="color:#666666;line-height:1.5;"><strong>Event Date:</strong>{formatted_date} </p>
						<p style="color:#666666;line-height:1.5;"><strong>Event Time:</strong>{formatted_date1}</p>
						<div style="display:flex">
							<div style="font-weight: bold; margin-right: 5px;color:#666666;">Venue:</div>
							<div style="max-width:300px;color:#666666;">{event_venue}</div>
						</div>
					</div>
					
					<div>
						<p style="color:#666666;line-height:1.5;">Thank you, and we hope you enjoy the event! </p>
					</div>

					<div style="padding:10px 20px; background-color:#f4f4f4;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;color:#888888;font-size:12px;">
						<p style="margin:0;">&copy;2024 64 Network Pvt Ltd. All rights reserved.</p>
					</div>
				</div>
			</div>
		"""
	else : 
		message = f"Thank you are registration"	

	frappe.sendmail(
		recipients=recipients,
		subject=subject,
		message=message
	)


