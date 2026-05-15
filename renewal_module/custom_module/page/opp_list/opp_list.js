
frappe.pages['opp-list'].on_page_show = function (wrapper) {
	console.log("🔄 Opp List page showing");
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css"
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.opp_list_page || frappe.opp_list_page.wrapper !== pageWrapper) {
				frappe.opp_list_page = new opplistpage(pageWrapper);
			}
			frappe.opp_list_page.render();
		});
	});
};




class opplistpage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
	}

	render() {

		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				// wait until layout injects DOM
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.opp_list_page_template.body);
			this.handleRoute();
		};

		waitForContent();
	}


	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		// opp-list
		if (route.length === 1) {
			return this.show_list();
		}
		// opp-list/new
		if (route.length === 2 && route[1] === "new") {
			return this.show_new();
		}
		// opp-list/<opp_id>
		if (route.length === 2) {
			const opp_id = route[1];
			return this.show_details(opp_id);
		}
	}

	setPageTitle(title) {
		document.title = title; // Browser tab title
		this.page.set_title(title); // ERPNext body title
	}
	bindActionDropdown() {
		$(document).off("click.msgclose");

		$(document).on("click.msgclose", ".btn-modal-close", function (e) {
			e.preventDefault();
			e.stopPropagation();

			// Proper way to close msgprint
			if (frappe.msg_dialog && frappe.msg_dialog.hide) {
				frappe.msg_dialog.hide();
			}
		});
	}

	// ...sidebar active code...
	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "ticket"
		// Reset states
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		$(".menu-parent").removeClass("active");

		// Use data-page for reliable matching
		$(".side-nav-link[data-page]").each(function () {
			const linkPage = $(this).data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				$(this).addClass("active-menu");
				const $item = $(this).closest(".side-nav-item");
				$item.addClass("active-menu-item");
				const $parent = $(this).closest(".menu-parent");
				if ($parent.length) {
					$parent.addClass("active");
					//$parent.children(".sub-menu").slideDown(0);
					$parent.closest(".sub-menu").each((idx, el) => {
						const $ancestor = $(el).closest(".menu-parent");
						if ($ancestor.length) {
							$ancestor.addClass("active");
						}
					});
				}
			}
		});

		if (window.syncSupportSidebarArrows) {
			window.syncSupportSidebarArrows();
		}
	}


	show_list() {
		$(".opp-list-view").removeClass("d-none");
		$(".opp-details-view").addClass("d-none");
		$(".new-opps").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Opp List");
				this.setActiveSidebar();
			} catch (err) {
				console.error("oppPage.make error:", err);
			}
		}, 200);

	}

	show_details(opp_id) {
		$(".opp-list-view").addClass("d-none");
		$(".opp-details-view").removeClass("d-none");
		$(".new-opps").addClass("d-none");
		this.setPageTitle(`opps/${opp_id}`)
		this.setActiveSidebar();

		// Load opp
		if (opp_id) {
			this.load_opp_details(opp_id, this.page);
		}
	}

	show_new() {
		this.setPageTitle("New Opp");
		this.setActiveSidebar();
		$(".opp-list-view").addClass("d-none");
		$(".opp-details-view").addClass("d-none");
		$(".new-opps").removeClass("d-none");

	}

}

frappe.opp_list_page_template = {
	body: `
		<div class="opp-list-view d-none">
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h2>Opp List</h2>
			</div>
		</div>
		<div class="opp-details-view d-none">
			<!-- Opp details will be rendered here -->
		</div>
		<div class="new-opps d-none">
			<!-- New opp form will be rendered here -->
		</div>
	`
};