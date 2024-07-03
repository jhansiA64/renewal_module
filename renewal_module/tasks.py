import frappe
from frappe import _

@frappe.whitelist()
def fetch_image(doctype, docname, fieldname):
    # Fetch the image data from the linked document
    image_data = frappe.db.get_value(doctype, docname, fieldname)

    return image_data

@frappe.whitelist()
def address_data(doctype,docname):
    # frappe.msgprint(docname)
    # add_list = frappe.db.sql("""SELECT ta.name, ta.address_title,ta.address_line1,ta.address_line2,ta.city,ta.state , ta.country, ta.pincode, ta.phone,ta.email_id 
    # FROM `tabAddress` ta
    # LEFT JOIN `tabDynamic Link` tdl on tdl.parent = ta.name
    # WHERE tdl.link_doctype = 'End Customer' and tdl.link_name =%s
    # """,docname,as_dict = 1)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(add_list)))
    addresses = frappe.get_all('Address', filters={'link_doctype': doctype, 'link_name': docname}, fields=['name', 'address_title', 'address_line1', 'address_line2', 'city', 'state', 'country', 'pincode', 'phone', 'email_id'])
   
    # Fetch contact details
    contacts = frappe.get_all('Contact', filters={'link_doctype': doctype, 'link_name': docname}, fields=['name', 'first_name','salutation', 'last_name','middle_name', 'phone', 'email_id'])
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(contacts)))
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(addresses)))
    
    
    return {
        "addresses": addresses,
        "contacts": contacts
    }



def filter_opportunities(user):
    # frappe.msgprint("hello world")
    if not user:
        user = frappe.session.user

    roles = frappe.get_roles(user)
    frappe.logger().info(f"Roles for user {user}: {roles}")
    if 'Sales Manager' in roles:
        employee = frappe.get_value('Employee', {'user_id': user}, 'name')
        frappe.logger().info(f"Employee for user {user}: {employee}")
        list_a=[]
        if employee:
            team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
            frappe.logger().info(f"Team members for employee {employee}: {team_members}")
            frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_members)))
            for member in team_members:
                list_a.append(member.user_id)
            team_user_ids = [member.user_id for member in team_members] + [user]
            frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids)))
            team_user_ids_str = "', '".join([frappe.db.escape(user_id) for user_id in team_user_ids])
            frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids_str)))
            # team_user_ids_str = f"'{team_user_ids_str}'"
            # frappe.logger().info(f"Generated SQL Condition: `tabOpportunity`.`owner` IN ({team_user_ids_str})")
            frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids_str)))
            return f"`tabOpportunity`.`owner` IN ({team_user_ids_str})"
    condition = f"`tabOpportunity`.`owner` = '{frappe.db.escape(user)}'"
    frappe.logger().info(f"Generated SQL Condition for non-Team Lead: {condition}")
    return condition
    # if 'Sales Manager' in roles:
    #     employee = frappe.get_value('Employee', {'user_id': user}, 'name')
    #     if employee:
    #         team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
    #         team_user_ids = [member.user_id for member in team_members] + [user]
    #         team_user_ids_str = "', '".join([frappe.db.escape(user_id) for user_id in team_user_ids])
    #         frappe.logger().info(f"Team User IDs: {team_user_ids_str}")
    #         return f"`tabOpportunity`.`owner` IN ('{team_user_ids_str}')"
        # if employee:
        #     team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
        #     team_user_ids = [member.user_id for member in team_members] + [user]
        #     team_user_ids_str = "', '".join([frappe.db.escape(user_id) for user_id in team_user_ids])
        #     frappe.logger().info(f"Team User IDs: {team_user_ids_str}")
        #     # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids)))
        #     return f"`tabOpportunity`.`owner` IN ('{team_user_ids_str}')"
    # else:
        # return f"`tabOpportunity`.`owner` = '{frappe.db.escape(user)}'"

def has_permission(doc, user):
    roles = frappe.get_roles(user)
    if 'Sales Manager' in roles:
        employee = frappe.get_value('Employee', {'user_id': user}, 'name')
        if employee:
            team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
            team_user_ids = [member.user_id for member in team_members] + [user]
            if doc.owner in team_user_ids:
                return True
    return doc.owner == user


# from flask import Flask, render_template, request, url_for

# app = Flask(__name__)

# @app.route('/career')
# def career():
#     return render_template('career.html')

# @app.route('/career',methods=['POST'])
# def carrer_job():
#     data1 = request.from['name']
#     return render_template('carrer_job.html', data=data1)

# if __name__ == '__main__':
#     app.run(debug=True)
