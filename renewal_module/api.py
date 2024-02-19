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