$(function () {
    const supportRoles = new Set([
        "l1 - tech support",
        "l2 - tech support",
        "l3 - tech support",
        "tech support"
    ]);

    const salesRoles = new Set([
        "sales user",
        "sales manager"
    ]);

    const privilegedRoles = new Set(["administrator", "system manager"]);

    let homeHandlersBound = false;
    let redirectedFromDeskHome = false;
    let captureHandlerBound = false;

    function isDesktopContextMenuItem($item) {
        if (!$item || !$item.length) {
            return false;
        }

        const label = $item.find(".menu-item-title").first().text().trim().toLowerCase();
        return label === "desktop";
    }

    function getRoles() {
        const roles =
            (frappe.boot && frappe.boot.user && frappe.boot.user.roles) ||
            frappe.user_roles ||
            [];

        return roles
            .map((role) => String(role || "").trim().toLowerCase())
            .filter(Boolean);
    }

    // Returns a specific target URL only for roles that have a custom home page.
    // System Manager and Administrator always return null (no redirect).
    // Returns null for all other users — Frappe handles their default routing.
    function getTargetHref() {
        const roles = getRoles();

        if (roles.some((role) => privilegedRoles.has(role))) {
            return null;
        }

        if (roles.some((role) => supportRoles.has(role))) {
            return "/desk/support-dashboard-te-1";
        }

        if (roles.some((role) => salesRoles.has(role))) {
            return "/desk/home-crm";
        }

        // No specific role match — let Frappe handle default routing.
        return null;
    }

    function navigateToTarget(href) {
        if (!href) {
            return;
        }
        const safeHref = String(href).trim();
        if (!safeHref || safeHref === "undefined" || safeHref === "null") {
            return;
        }
        const currentPath = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
        const targetPath = safeHref.replace(/\/+$/, "") || "/";
        if (currentPath === targetPath) {
            return;
        }
        window.location.assign(safeHref);
    }

    function updateHomeLinks() {
        const href = getTargetHref();
        const resolvedHref = href || "/desk";
        const $navbarHome = $(".navbar-home");
        const $breadcrumbHome = $(".navbar-breadcrumbs li:first-child > a");

        if ($navbarHome.length) {
            $navbarHome.attr("href", resolvedHref);
        }

        if ($breadcrumbHome.length) {
            $breadcrumbHome.attr("href", resolvedHref);
        }
    }

    function maybeAutoRedirectFromDeskHome() {
        if (redirectedFromDeskHome) {
            return;
        }

        const target = getTargetHref();
        // Only redirect if user has an explicit role-based target page.
        if (!target) {
            return;
        }

        const currentPath = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
        const targetPath = target.replace(/\/+$/, "") || "/";

        if ((currentPath === "/" || currentPath === "/desk" || currentPath === "/app") && targetPath !== currentPath) {
            redirectedFromDeskHome = true;
            navigateToTarget(target);
        }
    }

    function onHomeClick(event) {
        const target = getTargetHref();
        if (!target) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }
        navigateToTarget(target);
    }

    function onDocumentClickCapture(event) {
        const targetElement = event.target;
        if (!targetElement || !targetElement.closest) {
            return;
        }

        const isBreadcrumbHomeClick = Boolean(targetElement.closest(".navbar-breadcrumbs li:first-child > a"));
        if (!isBreadcrumbHomeClick) {
            return;
        }

        const target = getTargetHref();
        if (!target) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }

        navigateToTarget(target);
    }

    function bindCaptureHandlers() {
        if (captureHandlerBound) {
            return;
        }

        // Use capture phase so this wins even if framework listeners fire early.
        document.addEventListener("click", onDocumentClickCapture, true);
        captureHandlerBound = true;
    }

    function bindHomeHandlers() {
        if (homeHandlersBound) {
            return;
        }

        $(document)
            .off("click.brandHomeRedirect", ".navbar-home")
            .on("click.brandHomeRedirect", ".navbar-home", onHomeClick);

        $(document)
            .off("click.brandBreadcrumbRedirect", ".navbar-breadcrumbs li:first-child > a")
            .on("click.brandBreadcrumbRedirect", ".navbar-breadcrumbs li:first-child > a", onHomeClick);

        // Intercept profile/context menu "Desktop" click and apply the same role-based home routing.
        $(document)
            .off("click.brandContextDesktopRedirect", ".frappe-menu.context-menu .dropdown-menu-item")
            .on("click.brandContextDesktopRedirect", ".frappe-menu.context-menu .dropdown-menu-item", function (event) {
                const $item = $(this);
                if (!isDesktopContextMenuItem($item)) {
                    return;
                }

                const target = getTargetHref();
                if (!target) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) {
                    event.stopImmediatePropagation();
                }

                navigateToTarget(target);
            });

        homeHandlersBound = true;
    }

    function refreshNavigationState() {
        bindCaptureHandlers();
        bindHomeHandlers();
        updateHomeLinks();
    }

    frappe.after_ajax(() => {
        refreshNavigationState();
        setTimeout(maybeAutoRedirectFromDeskHome, 60);
    });

    if (frappe.router && frappe.router.on) {
        frappe.router.on("change", refreshNavigationState);
    }

    refreshNavigationState();
    setTimeout(maybeAutoRedirectFromDeskHome, 120);
});
