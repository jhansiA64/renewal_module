frappe.ready(() => {
    // Change ERPNext logo in desk
    $(".navbar-brand").html("<b>MyERP</b>");

    // Hide unwanted sidebar sections
    $(".desk-sidebar .module-section").first().hide();
});
