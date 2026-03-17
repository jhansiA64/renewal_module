// frappe.pages['tickets'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'None',
// 		single_column: true
// 	});
// }


// frappe.pages['tickets'].on_page_load = function(wrapper) {
//     // Only load content inside #support-page-content
//     $("#support-page-content").load("/tickets_content", function() {
//         console.log("✅ Tickets content loaded");
//     });

//     // Update sidebar active link
//     $(".side-nav-link").removeClass("active");
//     $(`.side-nav-link[onclick="loadPage('tickets')"]`).addClass("active");

//     loadSupportPage("tickets");
// };


frappe.pages['tickets'].on_page_load = function (wrapper) {

    frappe.require(
        "/assets/renewal_module/js/issue_themes/support_layout.js",
        function () {

            // ✅ Now the function exists
            loadSupportLayout(wrapper);

    //         frappe.require([
    //     "/assets/renewal_module/css/issue_themes/support_theme.css",
    //     "/assets/renewal_module/css/issue_themes/ticket_list.css"
    // ], function () {
    //     // CSS is loaded
    // });

            // ✅ SAFE: function is guaranteed to exist
            loadSupportPage("tickets");

            // render tickets
            frappe.require(
                "/assets/renewal_module/js/issue_themes/ticket_content.js",
                function() {
                    loadTicketsPage(wrapper);
                }
            )
        }
    );
};










// frappe.pages['tickets'].on_page_load = function (wrapper) {
// 	new tickets(wrapper);
// };
// // frappe.router.on('change', () => {
// //     console.log("🔁 Route changed → reinit theme");
// //     setTimeout(() => {
// //         window.initSupportTheme && initSupportTheme();
// //     }, 0);
// // });

// class tickets {
// 	constructor(wrapper) {
// 		this.wrapper = wrapper;

// 		this.page = frappe.ui.make_app_page({
// 			parent: wrapper,
// 			title: 'Ticket',
// 			single_column: true
// 		});

// 		this.load();
// 	}

// 	load() {
// 		frappe.call({
// 			method: "renewal_module.api.get_support_theme_page",
// 			callback: (r) => {
// 				if (r.message && r.message.rendered_html) {
// 					this.render(r.message.rendered_html);
// 				}
// 			}
// 		});
// 	}

// 	render(html) {
// 		// Clear page first
// 		this.page.main.empty();

// 		// Create a container
// 		const $container = $('<div class="tickets-container"></div>');

// 		// 1️⃣ Append theme layout (header/sidebar shell)
// 		$container.append(html);

// 		// 2️⃣ Append dashboard content (KPI cards)
// 		$container.find('.content1').first().append(
// 			frappe.tickets_page.body
// 		);

// 		// Attach to page
// 		this.page.main.append($container);
// 		//✅ IMPORTANT: initialize theme JS AFTER DOM exists
// 		// if (window.initSupportTheme) {
// 		// 	initSupportTheme();
// 		// }
// 		setTimeout(() => {
// 			window.initSupportTheme && initSupportTheme();
// 		}, 0);


// 	}

// }


// frappe.tickets_page = {
// 	body: `
// 		<div class="ticket-list-view">

// 			<div class="row">
// 				<div class="col-12">
// 					<div class="page-title-head d-flex align-items-center">
// 						<div class="flex-grow-1">
// 							<h4 class="fs-xl fw-bold m-0">Tickets</h4>
// 						</div>
// 						<div class="text-end">
// 							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
// 								<li class="breadcrumb-item"><a href="javascript: void(0);">Support</a></li>
// 								<li class="breadcrumb-item active">Tickets</li>
// 							</ol>
// 						</div>
// 					</div>
// 				</div>
// 			</div>		



// 		</div>	
// 	`
// }