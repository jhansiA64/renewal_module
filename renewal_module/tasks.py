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



# In your custom app, e.g., your_custom_app/api.py

import frappe

@frappe.whitelist()
def get_tree_data():
    data = [
        {
            "name": "Node 1",
            "children": [
                {"name": "Child 1"},
                {
                    "name": "Child 2",
                    "children": [
                        {"name": "Grandchild 1"},
                        {"name": "Grandchild 2"}
                    ]
                }
            ]
        },
        {"name": "Node 2"}
    ]
    return data


import frappe

import frappe

# @frappe.whitelist()
# def assign_task_to_users(doctype, name, user_list, description):
#     try:
#         if not isinstance(user_list, list):
#             user_list = eval(user_list)  # Convert string to list if needed
        
#         for user in user_list:
#             frappe.get_doc({
#                 "doctype": "ToDo",
#                 "description": description,
#                 "assigned_by": frappe.session.user,
#                 "assigned_to": user,
#                 "allocated_to":user,
#                 "reference_type": doctype,
#                 "reference_name": name
#             }).insert(ignore_permissions=True)
#         frappe.db.commit()  # Commit the changes to the database
#         return {'message': 'Task assigned successfully.'}
#     except Exception as e:
#         frappe.log_error(frappe.get_traceback(), 'Assign Task Error')
#         return {'error': str(e)}


@frappe.whitelist()
def assign_task_to_users(doctype, name, user_list, description):
    try:
        if not isinstance(user_list, list):
            user_list = eval(user_list)  # Convert string to list if needed
        
        existing_assignees = frappe.get_all("ToDo", filters={
            "reference_type": doctype,
            "reference_name": name,
            'status': ['!=', 'Cancelled']
        }, fields=["allocated_to"])

        existing_assignees = [assignee["allocated_to"] for assignee in existing_assignees]

        # Users to add
        users_to_add = []
        for user in user_list:
            # frappe.msgprint(user)
            if user not in existing_assignees:
                users_to_add.append(user)
        # users_to_add = [user for user in user_list if user not in existing_assignees]
        # Users to remove
        users_to_remove = []
        for each in existing_assignees:
            # frappe.msgprint(each)
            if each not in user_list:
                users_to_remove.append(each)
        # users_to_remove = [user for user in existing_assignees if user not in user_list]
        status = "Cancelled"
        for each in users_to_remove:
            sql_data = frappe.db.sql(f"""SELECT name FROM `tabToDo` WHERE  reference_type= '{doctype}' AND reference_name = '{name}' AND allocated_to= '{each}'  ;""")
            old_data = frappe.get_doc('ToDo',sql_data[0][0])
            # frappe.msgprint("hello hi hi")
            
            old_data.status = status
            old_data.save()

        # Remove assignments
        # for user in users_to_remove:
        #     frappe.msgprint(user)
        #     old_data = frappe.db.get_doc('ToDo', {
        #         'reference_type': doctype,
        #         'reference_name': name,
        #         'assigned_to': user
        #     })
        #     old_data.status = "Cancelled"
        #     old_data.save()
        
        # Add new assignments
        # for user in users_to_add:
        #     frappe.msgprint(user)
        #     frappe.get_doc({
        #         "doctype": "ToDo",
        #         "description": description,
        #         "assigned_by": frappe.session.user,
        #         "assigned_to": user,
        #         "reference_type": doctype,
        #         "reference_name": name
        #     }).insert(ignore_permissions=True)    

         
        
        for user in user_list:
            if user not in existing_assignees:
                frappe.get_doc({
                    "doctype": "ToDo",
                    "description": description,
                    "assigned_by": frappe.session.user,
                    "assigned_to": user,
                    "allocated_to": user,
                    "reference_type": doctype,
                    "reference_name": name
                }).insert(ignore_permissions=True)
        

        frappe.db.commit()  # Commit the changes to the database
        frappe.msgprint("Success")
        return {'message': 'Task assigned successfully.'}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), 'Assign Task Error')
        return {'error': str(e)}
    # try:
    #     # Ensure user_list is a list
    #     if not isinstance(user_list, list):
    #         user_list = eval(user_list)  # Convert string to list if needed
        
    #     # Fetch existing assignments from ToDo, excluding 'Cancelled' status
    #     existing_assignments = frappe.get_all('ToDo', filters={
    #         'reference_type': doctype,
    #         'reference_name': name,
    #         'status': ['!=', 'Cancelled']
    #     }, fields=['allocated_to'])
    #     existing_users = [assignment['allocated_to'] for assignment in existing_assignments]
        
    #     # Users to add
    #     users_to_add = [user for user in user_list if user not in existing_users]
    #     # Users to remove
    #     users_to_remove = [user for user in existing_users if user not in user_list]
        
    #     # Remove assignments
    #     for user in users_to_remove:
    #         frappe.msgprint(user)
    #         old_data = frappe.db.get_doc('ToDo', {
    #             'reference_type': doctype,
    #             'reference_name': name,
    #             'assigned_to': user
    #         })
    #         old_data.status = "Cancelled"
    #         old_data.save()
        
    #     # Add new assignments
    #     for user in users_to_add:
    #         frappe.get_doc({
    #             "doctype": "ToDo",
    #             "description": description,
    #             "assigned_by": frappe.session.user,
    #             "assigned_to": user,
    #             "reference_type": doctype,
    #             "reference_name": name
    #         }).insert(ignore_permissions=True)
        
    #     frappe.db.commit()  # Commit the changes to the database
    #     return {'message': 'Task assigned successfully.'}
    # except Exception as e:
    #     frappe.log_error(frappe.get_traceback(), 'Assign Task Error')
    #     return {'error': str(e)}
    # except Exception as e:
    #     frappe.log_error(frappe.get_traceback(), 'Assign Task Error')
    #     return {'error': str(e)}
    


# in renewal_module/tasks.py
import frappe

@frappe.whitelist()
def get_system_users(doctype, txt, searchfield, start, page_len, filters):
    system_users = frappe.db.sql("""
        SELECT name, full_name
        FROM `tabUser`
        WHERE enabled = 1
        AND user_type = 'System User'
        AND (name LIKE %s OR full_name LIKE %s)
        LIMIT %s, %s
    """, ('%' + txt + '%', '%' + txt + '%', start, page_len))

    return [(user[0], user[1]) for user in system_users]


# import frappe

# @frappe.whitelist()
# def share_task(doc_name, user, read=0, write=0):
#     try:
#         # Check if a share already exists and update it
#         if frappe.db.exists('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'}):
#             share_doc = frappe.get_doc('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'})
#             share_doc.read = int(read)
#             share_doc.write = int(write)
            
#         else:
#             # Add a new share entry for the Ride Order document
#             frappe.share.add(
#                 doctype='Task',
#                 name=doc_name,
#                 user=user,
#                 read=int(read),
#                 write=int(write)
#             )
        
#         # Handle the submit permission separately if needed
#         # if submit:
#         #     frappe.permissions.add_user_permission('Task', doc_name, user)
        
#         return 'success'
#     except Exception as e:
#         frappe.log_error(message=str(e), title="Share Task Error")
#         return 'error'

import frappe


@frappe.whitelist()
def share_ride_order(doc_name, user, read=0, write=0):
    try:
        if frappe.db.exists('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'}):
            share_doc = frappe.get_doc('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'})
            share_doc.read = int(read)
            share_doc.write = int(write)
            share_doc.save()
        else:
            frappe.share.add(
                doctype='Task',
                name=doc_name,
                user=user,
                read=int(read),
                write=int(write)
            )
        return 'success'
    except Exception as e:
        frappe.log_error(message=str(e), title="Share Task Error")
        return 'error'


@frappe.whitelist()
def unshare_ride_order(doc_name, user):
    try:
        if frappe.db.exists('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'}):
            frappe.db.delete('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'})
        return 'success'
    except Exception as e:
        frappe.log_error(message=str(e), title="Unshare Task Error")
        return 'error'

@frappe.whitelist()
def sync_sharing_permissions(doc_name, share_permissions):
    frappe.msgprint("hihihi")
    try:
        # Convert share_permissions to a list of dictionaries
        if not isinstance(share_permissions, list):
            share_permissions = frappe.parse_json(share_permissions)
        
        # Get the current shared users
        current_shared_users = frappe.get_all('DocShare', filters={'share_name': doc_name, 'share_doctype': 'Task'}, fields=['user'])
        current_shared_users = [user['user'] for user in current_shared_users]

        # Get the users from the share_permissions child table
        new_shared_users = [row['user'] for row in share_permissions]

        # Determine which users to unshare
        users_to_unshare = list(set(current_shared_users) - set(new_shared_users))

        # Unshare the document from users not in the new shared users list
        for user in users_to_unshare:
            frappe.msgprint("Hello")
            unshare_ride_order(doc_name, user)

        # Share the document with the new shared users
        for row in share_permissions:
            share_ride_order(doc_name, row['user'], row.get('read', 0), row.get('write', 0))

        return 'success'
    except Exception as e:
        frappe.log_error(message=str(e), title="Sync Sharing Permissions Error")
        return 'error'




import frappe

@frappe.whitelist()
def change_status_method(docname, new_status):
    try:
        # Fetch the document by its name
        doc = frappe.get_doc('Task', docname)
        
        # Update the status field
        doc.status = new_status
        
        # Save the document
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {'message': 'Status updated successfully.'}
    except Exception as e:
        # Log error and return message
        frappe.log_error(frappe.get_traceback(), 'Change Status Error')
        return {'error': str(e)}

# Email Group Filters to get field names
@frappe.whitelist()
# def get_column_list(doctype):
#     if not doctype:
#         return []

#     try:
#         meta = frappe.get_meta(doctype)
#         fields = [{'fieldname': d.fieldname} for d in meta.fields]
#         return fields
#     except Exception as e:
#         frappe.log_error(frappe.get_traceback(), 'Error in get_column_list')
#         return []


@frappe.whitelist()
def get_column_list(doctype):
    fields = frappe.get_meta(doctype).fields
    field_list = [{'fieldname': field.fieldname, 'label': field.label} for field in fields if field.fieldtype in ['Data', 'Select', 'Link']]
    return field_list

@frappe.whitelist()
def get_field_values(doctype, field_name):
    values = frappe.db.get_list(doctype, fields=[field_name], distinct=True)
    return [value[field_name] for value in values]


import frappe

@frappe.whitelist()
def get_distinct_field_value(doctype, field_name, start=0, page_length=20, search_term=''):
    if not doctype or not field_name:
        return []

    filters = f"{field_name} IS NOT NULL"
    if search_term:
        filters += f" AND {field_name} LIKE '%{search_term}%'"

    query = f"""
        SELECT DISTINCT {field_name}
        FROM `tab{doctype}`
        WHERE {filters}
        ORDER BY {field_name}
        LIMIT {start}, {page_length}
    """
    results = frappe.db.sql(query, as_dict=True)
    return [d[field_name] for d in results]







# def filter_opportunities(user):
#     # frappe.msgprint("hello world")
#     if not user:
#         user = frappe.session.user

#     roles = frappe.get_roles(user)
#     frappe.logger().info(f"Roles for user {user}: {roles}")
#     if 'Sales Manager' in roles:
#         employee = frappe.get_value('Employee', {'user_id': user}, 'name')
#         frappe.logger().info(f"Employee for user {user}: {employee}")
#         list_a=[]
#         if employee:
#             team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
#             frappe.logger().info(f"Team members for employee {employee}: {team_members}")
#             frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_members)))
#             for member in team_members:
#                 list_a.append(member.user_id)
#             team_user_ids = [member.user_id for member in team_members] + [user]
#             frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids)))
#             team_user_ids_str = "', '".join([frappe.db.escape(user_id) for user_id in team_user_ids])
#             frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids_str)))
#             # team_user_ids_str = f"'{team_user_ids_str}'"
#             # frappe.logger().info(f"Generated SQL Condition: `tabOpportunity`.`owner` IN ({team_user_ids_str})")
#             frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids_str)))
#             return f"`tabOpportunity`.`owner` IN ({team_user_ids_str})"
#     condition = f"`tabOpportunity`.`owner` = '{frappe.db.escape(user)}'"
#     frappe.logger().info(f"Generated SQL Condition for non-Team Lead: {condition}")
#     return condition
#     # if 'Sales Manager' in roles:
#     #     employee = frappe.get_value('Employee', {'user_id': user}, 'name')
#     #     if employee:
#     #         team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
#     #         team_user_ids = [member.user_id for member in team_members] + [user]
#     #         team_user_ids_str = "', '".join([frappe.db.escape(user_id) for user_id in team_user_ids])
#     #         frappe.logger().info(f"Team User IDs: {team_user_ids_str}")
#     #         return f"`tabOpportunity`.`owner` IN ('{team_user_ids_str}')"
#         # if employee:
#         #     team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
#         #     team_user_ids = [member.user_id for member in team_members] + [user]
#         #     team_user_ids_str = "', '".join([frappe.db.escape(user_id) for user_id in team_user_ids])
#         #     frappe.logger().info(f"Team User IDs: {team_user_ids_str}")
#         #     # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(team_user_ids)))
#         #     return f"`tabOpportunity`.`owner` IN ('{team_user_ids_str}')"
#     # else:
#         # return f"`tabOpportunity`.`owner` = '{frappe.db.escape(user)}'"

# def has_permission(doc, user):
#     roles = frappe.get_roles(user)
#     if 'Sales Manager' in roles:
#         employee = frappe.get_value('Employee', {'user_id': user}, 'name')
#         if employee:
#             team_members = frappe.get_all('Employee', filters={'reports_to': employee}, fields=['user_id'])
#             team_user_ids = [member.user_id for member in team_members] + [user]
#             if doc.owner in team_user_ids:
#                 return True
#     return doc.owner == user


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


@frappe.whitelist()
def filter_email_group_members(filters=None):
    import json

    # Ensure filters are parsed correctly
    if isinstance(filters, str):
        filters = json.loads(filters)

    if not filters:
        filters = []

    filter_conditions = []
    for f in filters:
        if f['condition'] == 'Equals':
            filter_conditions.append([f['type'], '=', f['value']])
        elif f['condition'] == 'Contains':
            filter_conditions.append([f['type'], 'like', '%' + f['value'] + '%'])
        # Add more conditions as needed

    email_group_members = frappe.get_all('Email Group Member', filters=filter_conditions, fields=['name', 'email', 'sales_partner', 'territory'])
    return email_group_members


# your_custom_app/your_custom_module/your_custom_page.py

import frappe

@frappe.whitelist()
def get_tree_graph_data():
    # Example data
    data = {
        "nodes": [
            {"name": "A", "target_amount": 5000, "achieved_amount": 4000},
            {"name": "B", "target_amount": 3000, "achieved_amount": 2500},
            {"name": "C", "target_amount": 2000, "achieved_amount": 1500}
        ]
    }
    return data



# Send Reminders
import frappe
from frappe.utils import now_datetime

def send_call_reminders():
    now = now_datetime()
    upcoming_calls = frappe.get_all('Call List', filters={
        'start_date': ['<=', now.date()],
        'start_time': ['<=', now.time()],
        'reminder_sent': 0,
        'status': 'Scheduled'
    })

    for call in upcoming_calls:
        call_doc = frappe.get_doc('Call List', call.name)
        # Send in-app notification
        frappe.publish_realtime(event='call_reminder', message=f"Reminder: You have a call with {call_doc.contact_person} at {call_doc.start_time}.", user=call_doc.owner)

        # Mark reminder as sent
        call_doc.reminder_sent = 1
        call_doc.save()
