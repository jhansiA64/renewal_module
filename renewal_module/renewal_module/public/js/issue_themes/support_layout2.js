window.loadSupportPage = function (page) {
    if (!page) return;
    console.log("➡️ Loading support page:", page);
    frappe.set_route("app", page);
};

window.loadSupportLayout = function (wrapper, callback, options = {}) {
    // Allow call without wrapper (use body as fallback)
    let $wrapper = wrapper ? $(wrapper) : $("body");
    let $root = $("#support-layout-root");

    console.log(
        "[loadSupportLayout] layout exists:",
        $root.length,
        "in DOM:",
        $root.length && document.body.contains($root[0])
    );

    if ($root.length) {
        if (!$root.parent().is($wrapper)) {
            $wrapper.append($root);
            console.log("➡️ Reattached support layout root");
        }

        // ONLY clear the page content area - DO NOT touch sidebar structure
        const contentArea = $("#support-page-content");
        if (contentArea.length) {
            contentArea.html(''); // Use html('') instead of empty() for safer clearing
        }

        // Ensure root is visible only
        $root.show();

        // DO NOT reapply applyRoleBasedSidebar() as it repositions sidebar
        // Only reinitialize theme if needed
        if (typeof initSupportTheme === "function" && options.reinitTheme !== false) {
            initSupportTheme();
        }

        console.log("✅ Support layout content refreshed");
        callback && callback();
        return;
    }

    console.warn("⚠️ Layout missing — recreating");
    // Remove children so we start clean inside provided wrapper
    $wrapper.children().remove();
    $wrapper.append(`<div id="support-layout-root"></div>`);

    $("#support-layout-root").load("/support_nav1", function () {
        frappe.require(
            ["/assets/renewal_module/js/issue_themes/support_theme2.js", "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js"],
            function () {
                window.initSupportTheme && initSupportTheme();
                applyRoleBasedSidebar();
            }
        );
        frappe.require(["https://cdn.jsdelivr.net/npm/dompurify@2.4.0/dist/purify.min.js",], function () {
            //console.log("✅ DOMPurify loaded for support layout");
        });

        window.supportLayoutLoaded = true;
        console.log("✅ Support layout recreated");
        callback && callback();
    });
};

$(document).off("click.support").on(
    "click.support",
    ".side-nav-link[data-page]",
    function (e) {
        e.preventDefault();
        e.stopPropagation();

        const $el = $(this);

        // Debounce: prevent rapid double clicks
        if ($el.data("clicking")) return;
        $el.data("clicking", true);
        setTimeout(() => $el.data("clicking", false), 350);

        const page = $el.data("page");
        const route = (frappe.get_route && frappe.get_route()) || [];
        // Frappe app pages often use either [page] or ["app", page]
        // Treat as same page only when we're already on the base page (no sub-route)
        const isSamePage =
            (route[0] === page && route.length <= 1) ||
            (route[0] === "app" && route[1] === page && route.length <= 2);

        // Handle navigation properly
        if (!isSamePage) {
            // Different page: load layout and navigate
            window.loadSupportLayout(
                undefined,
                () => {
                    frappe.set_route("app", page);
                },
                { clearContent: true, reinitTheme: true }
            );
        } else {
            // Same page clicked: just refresh the current list without API calls
            //console.log("🔄 Refreshing same page content...");

            // Simply refresh the current list view if available
            // This avoids making unnecessary API calls that cause 403 errors
            if (typeof cur_list !== 'undefined' && cur_list && typeof cur_list.refresh === 'function') {
                //console.log("✅ Refreshing list view with cur_list.refresh()");
                cur_list.refresh();
            } else if (typeof cur_page !== 'undefined' && cur_page && cur_page.page && typeof cur_page.page.refresh === 'function') {
                //console.log("✅ Refreshing page with cur_page.refresh()");
                cur_page.page.refresh();
            } else {
                //console.log("⚠️ No refresh method available, content already loaded");
                // Page is already loaded, no need to do anything
            }
        }
    }
);