"""
Backend API for Candidates Page
Uses Frappe's Job Applicant DocType as the data model
"""

from frappe import _
from datetime import datetime
import frappe
import json


@frappe.whitelist()
def get_list_data(start=0, page_length=20, status=None, search=None, filters=None):
    """
    Fetch Job Applicants with filtering, search, and pagination
    Returns list of candidates and total count
    """
    start = int(start or 0)
    page_length = int(page_length or 20)
    
    conditions = ["1=1"]
    values = {}
    
    # Apply status filter
    if status:
        conditions.append("status = %(status)s")
        values["status"] = status
    
    # Apply search filter
    if search:
        like = f"%{search}%"
        conditions.append("""(
            name LIKE %(like)s OR
            applicant_name LIKE %(like)s OR
            email_id LIKE %(like)s OR
            phone_number LIKE %(like)s OR
            designation LIKE %(like)s OR
            status LIKE %(like)s
        )""")
        values["like"] = like
    
    # Apply advanced filters
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception:
            filters_obj = []
        
        for f in (filters_obj or []):
            try:
                if isinstance(f, dict):
                    field = f.get("fieldname") or f.get("field") or ""
                    operator = (f.get("operator") or "=").lower()
                    val = f.get("value")
                elif isinstance(f, (list, tuple)):
                    if len(f) >= 3:
                        field, operator, val = f[0], f[1], f[2]
                    else:
                        continue
                else:
                    continue
            except Exception:
                continue
            
            if not field:
                continue
            
            key = f"f_{field}_{len(values)}"
            operator = (operator or "=").lower()
            
            # Build filter conditions
            if operator in ("=", "=="):
                conditions.append(f"`{field}` = %({key})s")
                values[key] = val
            elif operator in ("!=", "<>", "not equals"):
                conditions.append(f"`{field}` != %({key})s")
                values[key] = val
            elif operator in ("like", "contains"):
                conditions.append(f"`{field}` LIKE %({key})s")
                values[key] = f"%{val}%"
            elif operator in ("not like", "does not contain"):
                conditions.append(f"`{field}` NOT LIKE %({key})s")
                values[key] = f"%{val}%"
            elif operator in (">", "<", ">=", "<=", "after", "before"):
                sql_op = {
                    ">": ">", "<": "<", ">=": ">=", "<=": "<=",
                    "after": ">", "before": "<"
                }.get(operator, "=")
                conditions.append(f"`{field}` {sql_op} %({key})s")
                values[key] = val
            elif operator == "in":
                if isinstance(val, str):
                    val = [v.strip() for v in val.split(",") if v.strip()]
                if isinstance(val, (list, tuple)) and val:
                    placeholders = []
                    for i, v in enumerate(val):
                        kk = f"{key}_{i}"
                        placeholders.append(f"%({kk})s")
                        values[kk] = v
                    conditions.append(f"`{field}` IN ({', '.join(placeholders)})")
            elif operator in ("not in", "nin"):
                if isinstance(val, str):
                    val = [v.strip() for v in val.split(",") if v.strip()]
                if isinstance(val, (list, tuple)) and val:
                    placeholders = []
                    for i, v in enumerate(val):
                        kk = f"{key}_{i}"
                        placeholders.append(f"%({kk})s")
                        values[kk] = v
                    conditions.append(f"`{field}` NOT IN ({', '.join(placeholders)})")
    
    # Build WHERE clause
    where_clause = " AND ".join(conditions)
    
    # Get total count
    total = frappe.db.sql(
        f"SELECT COUNT(*) FROM `tabJob Applicant` WHERE {where_clause}",
        values
    )[0][0]
    
    # Fetch candidates
    candidates = frappe.db.sql(
        f"""
        SELECT 
            name, 
            applicant_name, 
            email_id as email, 
            phone_number as phone, 
            designation as job_title,
            job_title,
            status,
            creation,
            modified
        FROM `tabJob Applicant`
        WHERE {where_clause}
        ORDER BY modified DESC
        LIMIT {start}, {page_length}
        """,
        values,
        as_dict=True
    )
    
    return {"data": candidates, "total": total}


@frappe.whitelist()
def save_candidate(candidate_data):
    """
    Save or update a candidate
    candidate_data should be a dict with candidate info
    """
    if isinstance(candidate_data, str):
        candidate_data = json.loads(candidate_data)
    
    try:
        # Check if updating existing or creating new
        candidate_id = candidate_data.get("name")
        
        if candidate_id:
            # Update existing
            doc = frappe.get_doc("Job Applicant", candidate_id)
        else:
            # Create new
            doc = frappe.new_doc("Job Applicant")
        
        # Backward-compatible aliases used by older UI payloads
        aliases = {
            "email": "email_id",
            "phone": "phone_number",
            "job_title": "designation",
        }
        for old_key, new_key in aliases.items():
            if old_key in candidate_data and new_key not in candidate_data:
                candidate_data[new_key] = candidate_data.get(old_key)

        # Persist all provided values that are valid fields on Job Applicant.
        for fieldname, value in candidate_data.items():
            if fieldname == "name":
                continue
            if doc.meta.has_field(fieldname):
                setattr(doc, fieldname, value)
        
        # Save
        doc.save()
        
        return {
            "success": True,
            "message": "Candidate saved successfully",
            "candidate": {
                "name": doc.name,
                "applicant_name": doc.applicant_name,
                "email": doc.email_id,
                "phone": doc.phone_number,
                "job_title": doc.designation,
                "status": doc.status
            }
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "candidates.save_candidate")
        return {
            "success": False,
            "message": str(e)
        }


@frappe.whitelist()
def delete_candidate(candidate_id):
    """Delete a candidate"""
    try:
        frappe.delete_doc("Job Applicant", candidate_id)
        return {"success": True, "message": "Candidate deleted successfully"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "candidates.delete_candidate")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def update_candidate_status(candidate_id, new_status):
    """Update candidate status"""
    try:
        doc = frappe.get_doc("Job Applicant", candidate_id)
        doc.status = new_status
        doc.save()
        return {"success": True, "message": f"Candidate status updated to {new_status}"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "candidates.update_candidate_status")
        return {"success": False, "message": str(e)}
