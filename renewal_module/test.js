frappe.provide("renewal_module");

renewal_module.Opportunity = class Opportunity extends erpnext.crm.Opportunity {
    refresh() {
        this.show_notes();
        }
    };
extends_cscript(cur_frm.cscript, new renewal_module.Opportunity({ frm:cur_frm }));