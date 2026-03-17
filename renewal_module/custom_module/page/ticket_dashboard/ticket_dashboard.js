// frappe.pages['ticket-dashboard'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'None',
// 		single_column: true
// 	});
// }




frappe.pages['ticket-dashboard'].on_page_load = function (wrapper) {
  // Create Desk page container
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Ticket Dashboard',
    single_column: true
  });

  console.log("Template output:", frappe.render_template('support_center_html'));

  // Load CSS correctly (link elements)
  const css1 = document.createElement('link');
  css1.rel = 'stylesheet';
  css1.href = '/assets/renewal_module/css/ticket_dashboard.css';
  document.head.appendChild(css1);

  const css2 = document.createElement('link');
  css2.rel = 'stylesheet';
  css2.href = '/assets/renewal_module/css/styles.css'; // optional extra styles
  document.head.appendChild(css2);

  // Render your main Jinja/HTML template into the page body
  // renewal_module/renewal_module/templates/support_center_html.html
  $(page.body).html(frappe.render_template('support_center_html'));

  // Hide desk header & navbar for this page
  $(wrapper).find('.page-head').hide();
  $('.navbar').hide();

  // Sidebar toggle (query inside page body)
  const sidebar = page.body.querySelector('.td-sidebar');
  const btn = page.body.querySelector('.td-sidebar-toggle');
  if (btn && sidebar) {
    btn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // My Settings link
  const mySettings = page.body.querySelector('#my-settings-link');
  if (mySettings) {
    mySettings.onclick = () => frappe.set_route('Form', 'User', frappe.session.user);
  }

  // Lucide icons
  if (window.lucide) {
    lucide.replace();
  }

  // IMPORTANT: Do NOT overwrite wrapper/page after building it
  // wrapper.innerHTML = ...  // <-- avoid
};

frappe.pages['ticket-dashboard'].on_page_show = function () {
  $('.navbar').hide();
};

frappe.pages['ticket-dashboard'].on_page_leave = function () {
  $('.navbar').show();
};

