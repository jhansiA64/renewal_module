import frappe
from frappe import auth
from frappe import _

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
    # doc.save()

def show_error(doc,event):
    if doc.is_new():
        frappe.throw("error")
    else:
        frappe.msgprint("else stage")    

@frappe.whitelist( allow_guest=True )
def login(usr, pwd):
    try:
        login_manager = frappe.auth.LoginManager()
        login_manager.authenticate(user=usr, pwd=pwd)
        login_manager.post_login()
    except frappe.exceptions.AuthenticationError:
        frappe.clear_messages()
        frappe.local.response["message"] = {
            "success_key":0,
            "message":"Authentication Error!"
        }

        return

    api_generate = generate_keys(frappe.session.user)
    user = frappe.get_doc('User', frappe.session.user)

    frappe.response["message"] = {
        "success_key":1,
        "message":"Authentication success",
        "sid":frappe.session.sid,
        "api_key":user.api_key,
        "api_secret":api_generate,
        "username":user.username,
        "email":user.email
    }



def generate_keys(user):
    user_details = frappe.get_doc('User', user)
    api_secret = frappe.generate_hash(length=15)

    if not user_details.api_key:
        api_key = frappe.generate_hash(length=15)
        user_details.api_key = api_key

    user_details.api_secret = api_secret
    user_details.save()

    return api_secret


@frappe.whitelist()
def get_renewals_for_custom_ids(renewal_ids):
    #if not renewal_ids:
    #    return []
    #renewal_list = frappe.get_all('Renewal List',filters={'name':['in',renewal_ids]},
    #                fields=['name as renewal list'])
    #return renewal_list 
                          
    if isinstance(renewal_ids,str):
        try:
            renewal_ids = frappe.parse_json(renewal_ids)
        except Exception as e:
            frappe.throw(_('renewal_ids must be a list.'))
    if not isinstance(renewal_ids,list):
        frappe.throw(_("renewal_ids must be a list."))

    try:
        renewal_list = frappe.get_all('Renewal List',
        filters={'name':['in',renewal_ids]},
        fields=['name']
        )              
        return renewal_list
    except Exception as e:
        frappe.log_error(message=str(e),title="Error in fetching renewals")
        frappe.throw(_("there was an isssue fetching the renewal data."))    


##cof margin table code
import json 
import frappe

@frappe.whitelist()
def update_margin_table(custom_order_form,method=None):
    try:
        doc=frappe.get_doc("Customer Order Form",customer_order_form)
        frappe.msgprint(f"loaded cof number:{doc.name}")

        margin_updated = Flase

        for item in doc.items:
            actual_item_code = item.actual_item_code
            frappe.msgprint(f"processing item:{actual_item_code},rate:{item.rate},amount:{item.amount}")
            existing_margin_entry = None

            for margin_entry in doc.custom_magin_table:
                if margin_entry.item_code == actual_item_code:
                    existing_margin_entry = margin_entry
                    break

            if existing_margin_entry :
                if (existing_margin_entry.selleing_rate != item.rate or existing_margin_entry.selleing_amount !=item.amount
                   or existing_margin_entry.buying_rate != item.purchase_rate):
                   frappe.msgprint(f"updating margin entry for item:{actual_item_code}")
                   existing_margin_entry.selleing_rate = item.rate
                   existing_margin_entry.selleing_amount = item.amount
                   existing_margin_entry.buying_rate = item.purchase_rate

                   margin_updated = True


            else:
                frappe.msgprint(f"creating new marginentry for item:{actual_item_code}")
                margin_entry = {
                    'item_code':actual_item_code,
                    'selleing_rate':item.rate,
                    'selleing_amount':item.amount,
                    'buying_rate':item.purchase_rate
                }            
                doc.append('custom_magin_table',margin_entry)
                margin_updated = True

        if margin_updated:
            frappe.msgprint("changes detected.saving document")
            doc.save(ignore_permissions=True)

            frappe.db.commit()
            frappe.msgprint("margin table updated successfully") 

    except Exception as e:
        frappe.log_error(frappe.get_traceback(),"updated margin table error")   
        frappe.msgprint(f"An Error occcured:{str(e)}")     






