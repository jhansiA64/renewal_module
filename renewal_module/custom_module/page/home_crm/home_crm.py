import frappe
from frappe.utils import add_months, getdate, now_datetime, nowdate


@frappe.whitelist()
def get_territory_wise_sales(company=None, from_date=None, to_date=None, limit=12):
	"""Return top territories by sales amount for home CRM chart."""
	if not frappe.has_permission("Sales Invoice", "read"):
		return {
			"labels": [],
			"values": [],
			"last_synced": now_datetime(),
		}

	to_date = getdate(to_date) if to_date else getdate(nowdate())
	from_date = getdate(from_date) if from_date else add_months(to_date, -6)
	limit = cint(limit) if str(limit).isdigit() else 12
	limit = max(1, min(limit, 25))

	if not company:
		company = frappe.defaults.get_user_default("Company")

	conditions = [
		"si.docstatus = 1",
		"si.posting_date BETWEEN %(from_date)s AND %(to_date)s",
	]

	params = {
		"from_date": from_date,
		"to_date": to_date,
		"limit": limit,
	}

	if company:
		conditions.append("si.company = %(company)s")
		params["company"] = company

	condition_sql = " AND ".join(conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(c.territory, 'Not Set') AS territory,
			SUM(si.base_net_total) AS amount
		FROM `tabSales Invoice` si
		LEFT JOIN `tabCustomer` c ON c.name = si.customer
		WHERE {condition_sql}
		GROUP BY COALESCE(c.territory, 'Not Set')
		ORDER BY amount DESC
		LIMIT %(limit)s
		""",
		params,
		as_dict=True,
	)

	labels = [row.territory for row in rows]
	values = [flt(row.amount) for row in rows]

	return {
		"labels": labels,
		"values": values,
		"last_synced": now_datetime(),
	}


def flt(value):
	return float(value or 0)


def cint(value):
	try:
		return int(value)
	except Exception:
		return 0
