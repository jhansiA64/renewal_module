import frappe
from frappe import _

@frappe.whitelist()
def fetch_image(doctype, docname, fieldname):
    # Fetch the image data from the linked document
    image_data = frappe.db.get_value(doctype, docname, fieldname)

    return image_data

@frappe.whitelist()
def get_column_list(doctype):
    fields = frappe.get_meta(doctype).fields
    field_list = [{'fieldname': field.fieldname, 'label': field.label} for field in fields if field.fieldtype in ['Data', 'Select', 'Link']]
    return field_list

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

# this code is for Task Document

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

@frappe.whitelist()
def share_task(doc_name, user, read=0, write=0):
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
def unshare_task(doc_name, user):
    try:
        if frappe.db.exists('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'}):
            frappe.db.delete('DocShare', {'user': user, 'share_name': doc_name, 'share_doctype': 'Task'})
        return 'success'
    except Exception as e:
        frappe.log_error(message=str(e), title="Unshare Task Error")
        return 'error'

@frappe.whitelist()
def sync_sharing_permissions(doc_name, share_permissions):
    # frappe.msgprint("hihihi")
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
            # frappe.msgprint("Hello")
            unshare_task(doc_name, user)

        # Share the document with the new shared users
        for row in share_permissions:
            share_task(doc_name, row['user'], row.get('read', 0), row.get('write', 0))

        return 'success'
    except Exception as e:
        frappe.log_error(message=str(e), title="Sync Sharing Permissions Error")
        return 'error'
