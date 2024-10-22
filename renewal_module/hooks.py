from . import __version__ as app_version

app_name = "renewal_module"
app_title = "Renewal Module"
app_publisher = "Aravind Mandala"
app_description = "it is renewal module"
app_icon = "octicon octicon-file-directory"
app_color = "grey"
app_email = "aravind.m@64network.com"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/renewal_module/css/renewal_module.css"
# app_include_js = "/assets/renewal_module/js/renewal_module.js"

# Include your JavaScript file
app_include_js = "/assets/renewal_module/js/target_page.js"

app_include_css = "/assets/renewal_module/css/desk_custom.css"


# include js, css files in header of web template
# web_include_css = "/assets/renewal_module/css/renewal_module.css"
# web_include_js = "/assets/renewal_module/js/renewal_module.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "renewal_module/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

doctype_js={"Opportunity": "renewal_module/test.js"}

#Export Fixtures
fixtures = [{"dt": "Custom Field", "filters": [["name", "in", [
"Item-availability",
"Customer-email_details",
"Customer-mx_record",
"Customer-email_service_provider",
"Customer-column_break_4bkbp",
"Customer Order Form Item-renewal_id",
"Opportunity Item-orc",
"Opportunity Item-column_break_aeclv",
"Opportunity Item-rate_value",
"Opportunity Item-commission_type",
"Opportunity Item-commission_section",
"Quotation-billing_address_gstin","Quotation-customer_gstin",
"Quotation Item-renewal_id",
"Quotation Item-start_date",
"Quotation Item-end_date",
"Quotation Item-renewal_status",
"Quotation Item-tax_rate",
"Renewal Item-status",
"Sales Invoice Item-renewal_id",
"Sales Invoice-workflow_state"
        ]]
    ]},"Server Script","Client Script","Property Setter"
]

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

website_route_rules = [
    {"from_route": "/job-opening/<name>", "to_route": "job_opening"}
]

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "renewal_module.install.before_install"
# after_install = "renewal_module.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "renewal_module.uninstall.before_uninstall"
# after_uninstall = "renewal_module.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "renewal_module.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }

# permission_query_conditions = {
# 	"Opportunity":"renewal_module.tasks.filter_opportunities",
# }

# has_permission = {
#     "Opportunity": "renewal_module.tasks.has_permission"
# }

#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes
#override_doctype_class = {
#	"Notification": "renewal_module.overrides.cust_nofitication.Cust_Notification"
#}
# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

override_doctype_class = {
	"Employee": "renewal_module.overrides.EmployeeStatus"
}

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
#	}
# }

doc_events = {
	"Customer":{
		"onload":"renewal_module.api.get_renewals"
	},
	"Customer Order Form":{
		"onload":"renewal_module.api.show_error"
	},
	# "Event Registration": {
	# 	"on_update":"renewal_module.api.email_on_approval"
	# },
	"Event Registration" : {
		"on_update":"renewal_module.custom_website.doctype.event_registration.event_registration.email_on_approval"
	},
	"Customer Order Form":{
		"on_update":"renewal_module.api.update_margin_table"
	}
	
}

# Scheduled Tasks
# ---------------

scheduler_events = {

	"cron":{
		"* * * * *":[
			"renewal_module.tasks.cron"
		]
	},

	"all": [
		"renewal_module.tasks.send_call_reminders"
	],
	# "daily": [
	# 	"renewal_module.tasks.daily"
	# ],
	# "hourly": [
	# 	"renewal_module.tasks.hourly"
	# ],
	# "weekly": [
	# 	"renewal_module.tasks.weekly"
	# ]
	# "monthly": [
	# 	"renewal_module.tasks.monthly"
	# ]
}

# Testing
# -------

# before_tests = "renewal_module.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "renewal_module.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "renewal_module.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]


# User Data Protection
# --------------------

user_data_fields = [
	{
		"doctype": "{doctype_1}",
		"filter_by": "{filter_by}",
		"redact_fields": ["{field_1}", "{field_2}"],
		"partial": 1,
	},
	{
		"doctype": "{doctype_2}",
		"filter_by": "{filter_by}",
		"partial": 1,
	},
	{
		"doctype": "{doctype_3}",
		"strict": False,
	},
	{
		"doctype": "{doctype_4}"
	}
]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"renewal_module.auth.validate"
# ]

# Translation
# --------------------------------

# Make link fields search translated document names for these DocTypes
# Recommended only for DocTypes which have limited documents with untranslated names
# For example: Role, Gender, etc.
# translated_search_doctypes = []
