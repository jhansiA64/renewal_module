

# import frappe

# def update_assets_on_employee_save(doc, method):
#     """Sync assigned assets when Employee is saved"""

#     # 1. Get current list of assets from child table
#     current_assets = {row.asset: row for row in doc.custom_asset_allocation if row.asset}

#     # 2. Get old list of assets (before save)
#     old_doc = doc.get_doc_before_save()
#     old_assets = {}
#     if old_doc:
#         old_assets = {row.asset: row for row in old_doc.custom_asset_allocation if row.asset}

#     # --- Handle Removed Assets ---
#     removed_assets = set(old_assets.keys()) - set(current_assets.keys())
#     for asset in removed_assets:
#         asset_doc = frappe.get_doc("Company Asset", asset)
#         asset_doc.status = "Available"
#         asset_doc.assigned_to = None
#         asset_doc.save(ignore_permissions=True)

#     # --- Handle Added/Updated Assets ---
#     for asset, row in current_assets.items():
#         asset_doc = frappe.get_doc("Company Asset", asset)

#          # If Return Date is set → asset is available
#         if row.return_date and asset_doc.status != "Available":
#             # frappe.msgprint("if")
#             asset_doc.status = "Available"
#             asset_doc.assigned_to = None
#             asset_doc.save()
#         elif asset_doc.status != "Assigned" and not asset_doc.assigned_to:
#             # frappe.msgprint("elif")
#                 # Guard: prevent double assignment to another employee
#             if asset_doc.status == "Assigned" and asset_doc.get("assigned_to") and asset_doc.assigned_to != doc.parent:
#                 frappe.throw(f"Asset {asset_doc.name} is already assigned to Employee {asset_doc.assigned_to}.")
#             asset_doc.status = "Assigned"
#             asset_doc.assigned_to = doc.name  # employee ID
#             asset_doc.save()
#         elif asset_doc.assigned_to  and asset_doc.status != "Assigned":
#             asset_doc.status = "Assigned"
#             asset_doc.save() 



# def load_asset_details(doc, event):
#     doc.set("custom_employee_assets", [])
    
#     active_list = frappe.db.get_list("Asset Allocation",filters={"assign_to":doc.name},fields=['name'],page_length="*",order_by="creation ASC")
#     if active_list:
#         for each in active_list:
#             # frappe.msgprint(each.name)
#             each_data = frappe.db.get_value("Asset Allocation",each.name,['asset','status','issue_date','returned','name'],as_dict=1)
#             # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
#             doc.append("custom_employee_assets",{
#                 'asset' : each_data.asset,
#                 'status': each_data.status,
#                 'issue_date':each_data.issue_date,
#                 'returned':each_data.returned,
#                 'employee_allocation':each_data.name
#             })




import frappe

def update_assets_on_employee_save(doc, method):
    """Sync assigned assets when Employee is saved"""

    asset = doc.asset
    employee = doc.assign_to

    asset_doc = frappe.get_doc("Company Asset", asset)

    if doc.returned:
        # If Return Date is set → asset is available
        if  asset_doc.status != "Available":
            # frappe.msgprint("if")
            asset_doc.status = "Available"
            asset_doc.assigned_to = None
            asset_doc.save()
        
    else:
        

        if asset_doc.status != "Assigned" and not asset_doc.assigned_to:
            # frappe.msgprint("elif")
                # Guard: prevent double assignment to another employee
            if asset_doc.status == "Assigned" and asset_doc.get("assigned_to") and asset_doc.assigned_to != employee:
                frappe.throw(f"Asset {asset_doc.name} is already assigned to Employee {asset_doc.assigned_to}.")
            asset_doc.status = "Assigned"
            asset_doc.assigned_to = employee  # employee ID
            asset_doc.save()
        elif asset_doc.assigned_to  and asset_doc.status != "Assigned":
            asset_doc.status = "Assigned"
            asset_doc.save() 



def load_asset_details(doc, event):
    doc.set("custom_employee_assets", [])
    
    active_list = frappe.db.get_list("Asset Allocation",filters={"assign_to":doc.name},fields=['name'],page_length="*",order_by="creation ASC")
    if active_list:
        for each in active_list:
            # frappe.msgprint(each.name)
            each_data = frappe.db.get_value("Asset Allocation",each.name,['asset','status','issue_date','returned','name'],as_dict=1)
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each_data)))
            doc.append("custom_employee_assets",{
                'asset' : each_data.asset,
                'status': each_data.status,
                'issue_date':each_data.issue_date,
                'returned':each_data.returned,
                'employee_allocation':each_data.name
            })