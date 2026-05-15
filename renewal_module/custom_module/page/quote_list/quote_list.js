
frappe.pages['quote-list'].on_page_load = function (wrapper) {
	new opplistpage(wrapper);
};

frappe.pages['quote-list'].on_page_show = function (wrapper) {
	console.log("🔄 Quote List page showing");
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
			if (!frappe.quote_list_page || frappe.quote_list_page.wrapper !== pageWrapper) {
				frappe.quote_list_page = new opplistpage(pageWrapper);
			}
			frappe.quote_list_page.render();
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
			$content.empty().append(frappe.quote_list_page_template.body);
			this.handleRoute();
		};

		waitForContent();
	}


	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		// quote-list
		if (route.length === 1) {
			return this.show_list();
		}
		// quote-list/new
		if (route.length === 2 && route[1] === "new") {
			return this.show_new();
		}
		// quote-list/<quote_id>
		if (route.length === 2) {
			const quote_id = route[1];
			return this.show_details(quote_id);
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
		$(".quote-list-view").removeClass("d-none");
		$(".quote-details-view").addClass("d-none");
		$(".new-quotes").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Quote List");
				this.setActiveSidebar();
			} catch (err) {
				console.error("quotePage.make error:", err);
			}
		}, 200);

	}

	show_details(quote_id) {
		$(".quote-list-view").addClass("d-none");
		$(".quote-details-view").removeClass("d-none");
		$(".new-quotes").addClass("d-none");
		this.setPageTitle(`quotes/${quote_id}`)
		this.setActiveSidebar();

		// Load quote
		if (quote_id) {
			this.load_quote_details(quote_id, this.page);
		}
	}

	show_new() {
		this.setPageTitle("New Quote");
		this.setActiveSidebar();
		$(".quote-list-view").addClass("d-none");
		$(".quote-details-view").addClass("d-none");
		$(".new-quotes").removeClass("d-none");

	}

}

frappe.quote_list_page_template = {
	body: `
		<div class="quote-list-view d-none">
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h2>Quote List</h2>
			</div>
		</div>
		<div class="quote-details-view d-none">
			<!-- Quote details will be rendered here -->
		</div>
		<div class="new-quotes d-none">
			<!-- New quote form will be rendered here -->
		</div>
	`
};