
$(function () {

    const supportRoles = new Set([
        "L1 - Tech Support",
        "L2 - Tech Support",
        "Tech Support",
    ]);

    function getRoles() {
        const roles =
            (frappe.boot && frappe.boot.user && frappe.boot.user.roles) ||
            frappe.user_roles ||
            [];

        const normalizedRoles = roles
            .map(role => String(role || "").trim())
            .filter(Boolean);

        //console.log("[BrandClick] Roles detected:", normalizedRoles);
        return normalizedRoles;
    }

    function getTargetHref() {
        const roles = getRoles();

        // 🔴 HARD ADMIN OVERRIDE
        if (roles.includes("Administrator")) {
            //console.log("[BrandClick] Administrator detected → /app");
            return "/app";
        }

        const isSupportUser = roles.some(role => supportRoles.has(role));
        //console.log("[BrandClick] isSupportUser:", isSupportUser);

        const route = isSupportUser
            ? "/app/support-dashboard"
            : "/app";

        //console.log("[BrandClick] Final route:", route);
        return route;
    }

    function updateNavbarHomeHref(reason) {
        const href = getTargetHref();
        const $home = $(".navbar-home");

        if ($home.length) {
            //console.log("[BrandClick] Setting navbar-home href:", href, "reason:", reason);
            $home.attr("href", href);
        } else {
            //console.log("[BrandClick] navbar-home not found. reason:", reason);
        }
    }

    function scheduleUpdate(reason, attempt) {
        const tryCount = attempt || 0;
        updateNavbarHomeHref(reason);

        const rolesReady = getRoles().length > 0;
        if (!rolesReady && tryCount < 5) {
            setTimeout(() => scheduleUpdate(reason, tryCount + 1), 300);
        }
    }

    // Set href AFTER desk is fully ready
    frappe.after_ajax(() => {
        scheduleUpdate("after-ajax");
    });

    if (frappe.router && frappe.router.on) {
        frappe.router.on("change", () => {
            scheduleUpdate("route-change");
        });
    }

    // Always recompute on click
    $(document).on("click", ".navbar-home", function (e) {
        e.preventDefault();

        const href = getTargetHref();
        //console.log("[BrandClick] Click redirect:", href);

        window.location.href = href;
    });

    scheduleUpdate("initial");

});