# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _

def execute(filters=None):
	columns=[
		{
			"fieldname":"name",
			"fieldtype":"Data",
			"label":"Opportunity ID",
			"width":150

		},
		{
			"fieldname":"customername",
			"fieldtype":"Data",
			"label":"Customer Name",
			"width":150
		}
	],
	data=[
		{"name":"opp2300929","customername":"patil rail"},
		{"name":"opp2300931","customername":"BIGgrafx"},
		{"name":"opp2300935","customername":"OIA Technology"}
	]
	return columns,data

