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
#app_include_js = "/assets/renewal_module/js/target_page.js"

#app_include_css = "/assets/renewal_module/css/desk_custom.css"

#app_include_css = "/assets/renewal_module/public/css/custom_desk.css"

#app_include_js = "/assets/renewal_module/public/js/custom_desk.js"

app_include_js = [
    #"https://cdn.jsdelivr.net/npm/dompurify@2.4.0/dist/purify.min.js",
    # "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js",
    "/assets/renewal_module/js/issue_themes/brandlogo.js",
]

app_include_css = [
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
]


# include js, css files in header of web template
# web_include_css = "/assets/renewal_module/css/renewal_module.css"
# web_include_js = "/assets/renewal_module/js/renewal_module.js"
web_include_css = "/assets/renewal_module/css/renewal_module_website.css"
#web_include_css ="renewal_module/renewal_module/public/renewal_module_website.css"
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

doctype_js = {"Opportunity": "renewal_module/test.js"}
doctype_list_js = {"Opportunity": "public/js/opp_list.js"}

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

page_js = {
    "issue_theme": "public/js/issue_theme.js"
}

# Home Pages
# ----------

# application home page (will override Website Settings)
#home_page = "login"
#home_page = "index"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

role_home_page = {
    "Customer": "me",
}

# when the custom pages to redirect after login
on_session_creation = ["renewal_module.api.redirect_after_login"]
boot_session = ["renewal_module.api.apply_role_home_page_in_boot"]

# website_redirects = [
#     {"source": "/", "target": "/app"}
# ]
# website_redirects removed — role_home_page handles per-role routing;
# a blanket / → /app redirect bypassed role-based home pages in new tabs
website_route_rules = [
    # {"from_route": "/", "to_route": "/app"},
    {"from_route": "/job-opening/<name>", "to_route": "job_opening"},
    { "from_route":"/renewal_list","to_route":"renewal_list" },
    {
        "from_route":"/renewal_list/<path:name>",
        "to_route":"/renewal_list",
        "defaults":{
            "doctype":"Renewal List",
            "parents":[{"label":"Renewal List","route":"renewal_list"}]
        }
    },
    {
        "from_route": "/sales_order", "to_route": "sales_order"
    },
    {
        "from_route": "/sales_order/<path:name>",
        "to_route": "sales_order",
        "defaults": {
            "doctype": "Sales Order",
            "parents": [
                {
                    "label": "Sales Order",
                    "route": "sales_order"
                }
            ]
        }
    },
    {
        "from_route": "/sales_invoice", "to_route": "sales_invoice"
    },
    {
        "from_route": "/sales_invoice/<path:name>",
        "to_route": "sales_invoice",
        "defaults": {
            "doctype": "Sales Invoice",
            "parents": [
                {
                    "label": "Sales Invoice",
                    "route": "sales_invoice"
                }
            ]
        }
    },
    {
        "from_route": "/issue", "to_route": "issue"
    },
    {
        "from_route": "/isssue/<path:name>",
        "to_route": "issue",
        "defaults": {
            "doctype": "Issue",
            "parents": [
                {
                    "label": "Issue",
                    "route": "issue"
                }
            ]
        }
    },
    {
        "from_route": "/address_list", "to_route": "address_list"
    },
    {
        "from_route": "/address_list/<path:name>",
        "to_route": "address_list",
        "defaults": {
            "doctype": "Address",
            "parents": [
                {
                    "label": "Address",
                    "route": "address_list"
                }
            ]
        }
    },
    
]
website_context = {
    "web_sidebar": "renewal_module/templates/includes/web_sidebar.html",
    "web_sidebar1": "renewal_module/templates/includes/web_sidebar1.html",
    "override_doctype_templates": {
        "me": "renewal_module/www/me.html",
    },
}

#after_migrate = ["renewal_module.customizations.login_navbar.ensure_login_navbar_block"]


# has_permission = {
#     "Call List": "renewal_module.user_permissions.calllist_has_permission",
#     "Opportunity": "renewal_module.user_permissions.opportunity_has_permission",
#     "Quotation": "renewal_module.user_permissions.quotation_has_permission",
#     "Customer Order Form": "renewal_module.user_permissions.cof_has_permission",
#     "ORC List": "renewal_module.user_permissions.orc_has_permission",
#     "Appointment": "renewal_module.user_permissions.appointment_has_permission",
#     "Contact": "renewal_module.user_permissions.contact_has_permission",
#     "Address": "renewal_module.user_permissions.address_has_permission",
#     "Sales Order": "renewal_module.user_permissions.sales_order_has_permission",
#     "Sales Invoice": "renewal_module.user_permissions.sales_invoice_has_permission",
# }

# permission_query_conditions = {
#     "Call List": "renewal_module.user_permissions.calllist_permission_query",
#     "Opportunity": "renewal_module.user_permissions.opportunity_permission_query",
#     "Quotation": "renewal_module.user_permissions.quotation_permission_query",
#     "Customer Order Form": "renewal_module.user_permissions.cof_permission_query",
#     "ORC List": "renewal_module.user_permissions.orc_permission_query",
#     "Appointment": "renewal_module.user_permissions.appointment_permission_query",
#     "Contact": "renewal_module.user_permissions.contact_permission_query",
#     "Address": "renewal_module.user_permissions.address_permission_query",
#     "Sales Order": "renewal_module.user_permissions.sales_order_permission_query",
#     "Sales Invoice": "renewal_module.user_permissions.sales_invoice_permission_query",
# }

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
	"Employee": "renewal_module.overrides.EmployeeStatus",
    "Appointment":"renewal_module.appointment_override.CustomAppointment"
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
	# "Event Registration" : {
	# 	"on_update":"renewal_module.custom_website.doctype.event_registration.event_registration.email_on_approval"
	# },
	"Customer Order Form":{
		"on_update":"renewal_module.api.update_margin_table"
	},
    "Issue": {
        "before_save": "renewal_module.issues.before_save",
        # "before_save": "renewal_module.issue_hooks.track_user_time_log",
        # "before_save": "renewal_module.custom_issue.before_save_issue",
        #"after_insert": "renewal_module.api.send_issue_email"
    },
    # "ToDo":{
    #     "after_insert": "renewal_module.issues.after_insert",

    # },

    # "Issue Time Log": {
    #     "before_save": "renewal_module.custom_issue.calculate_working_hours_duration"
    # },
    "Issue": {
        "after_insert": "renewal_module.api.send_issue_email",
        "before_save": "renewal_module.api.send_issue_email_on_agent_change"
    },

    "Employee": {
        # "on_update": "renewal_module.asset_allocation.update_assets_on_employee_save",
        "onload":"renewal_module.asset_allocation.load_asset_details"
    },
    "Asset Allocation":{
        "after_save":"renewal_module.asset_allocation.update_assets_on_employee_save",
        "on_update":"renewal_module.asset_allocation.update_assets_on_employee_save"
    },
    "Appointment":{
        "after_insert": "renewal_module.appointment_notifications.appointment_after_insert",
        "on_update": "renewal_module.appointment_notifications.appointment_on_update"
    }

    
    "Quotation": {
        "validate": "renewal_module.custom_module.quote_list.quotation_hooks.validate_payment_terms_approval",
        "before_submit": "renewal_module.custom_module.quote_list.quotation_hooks.validate_payment_terms_approval",
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
    "cron": {
        "*/1 * * * *": [
            "renewal_module.tasks.send_calendar_notifications"
        ],
        "*/1 * * * *": [
            "renewal_module.reminder.check_due_notifications"
        ]
    },

	"all": [
		"renewal_module.tasks.send_call_reminders",
        "renewal_module.reminder.send_reminders"
	],
    "cron": {
        "* * * * *": [  
            "renewal_module.appointment_notifications.check_and_send_reminders"
        ]
    },



	"daily": [
		"renewal_module.custom_issue.close_resolved_issues"
	],
	# "hourly": [
	# 	"renewal_module.tasks.hourly"
	# ],
	# "weekly": [
	# 	"renewal_module.tasks.weekly"
	# ]
	# "monthly": [
	# 	"renewal_module.tasks.monthly"
	# ]

    

    "cron": {
        "*/15 * * * *":
        [
            "renewal_module.microsoft_oauth.sync_microsoft_events_to_erpnext"
        ]
        },

    "cron": {
        "*/15 * * * *":
        [
            "renewal_moodule.microsoft_oauth.sync_erpnext_events_to_microsoft"
        ]
    },
}

scheduler_events = {
    "cron": {
        "* * * * *": [
            "renewal_module.api.test_cron_job"
        ]
    }
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
