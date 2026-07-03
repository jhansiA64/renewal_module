//function initSupportTheme() {
window.syncSupportSidebarArrows = function (container = document) {
    const root = container && container.querySelectorAll ? container : document;
    root.querySelectorAll(".menu-parent").forEach(menu => {
        const arrow = menu.querySelector(".menu-arrow");
        if (!arrow) return;

        const isOpen = menu.classList.contains("active");
        arrow.classList.toggle("fa-chevron-up", !!isOpen);
        arrow.classList.toggle("fa-chevron-down", !isOpen);
    });
};

//function initSupportTheme() {
window.initSupportTheme = function () {
    //console.log("🔄 initSupportTheme called");
    // Clean previously attached handlers to avoid double toggles on re-init
    document.removeEventListener("click", window.__supportThemeDocClick);
    document.removeEventListener("click", window.__supportThemeMobileOutsideClick);
    if (window.__supportThemeResizeHandler) {
        window.removeEventListener("resize", window.__supportThemeResizeHandler);
    }
    if (window.__supportThemeSidebarEl && window.__supportThemeSidebarClickHandler) {
        window.__supportThemeSidebarEl.removeEventListener("click", window.__supportThemeSidebarClickHandler, true);
    }
    if (window.__supportThemeHamburgerEl && window.__supportThemeHamburgerClickHandler) {
        window.__supportThemeHamburgerEl.removeEventListener("click", window.__supportThemeHamburgerClickHandler);
    }

    const notifBtn = document.getElementById('notifBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    const userBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    function closeDropdown(dropdown) {
        if (!dropdown) return;
        dropdown.classList.remove("open");
        dropdown.setAttribute("aria-hidden", "true");
    }
    function openDropdown(dropdown) {
        if (!dropdown) return;
        dropdown.classList.add("open");
        dropdown.setAttribute("aria-hidden", "false");
    }

    function isOpen(dropdown) {
        return dropdown && dropdown.classList.contains("open");
    }

    function closeAll() {
        closeDropdown(notifDropdown);
        closeDropdown(userDropdown);
    }

    if (notifBtn && notifDropdown) {
        notifBtn.addEventListener('click', e => {
            if (e.target.closest("#notifDropdown")) return;
            e.stopPropagation();
            if (isOpen(notifDropdown)) {
                closeDropdown(notifDropdown);          // ✅ double click closes
            } else {
                closeDropdown(userDropdown);           // ✅ close other
                openDropdown(notifDropdown);
            }
            //notifDropdown.classList.toggle('open');
        });
        notifDropdown.addEventListener("click", e => {
            e.stopPropagation(); // keep open
        });
    }

    if (userBtn && userDropdown) {
        userBtn.addEventListener('click', e => {
            e.stopPropagation();
            // userDropdown.classList.toggle('open');
            if (isOpen(userDropdown)) {
                closeDropdown(userDropdown);           // ✅ double click closes
            } else {
                closeDropdown(notifDropdown);          // ✅ close other
                openDropdown(userDropdown);
            }
        });
        userDropdown.addEventListener("click", e => {
            e.stopPropagation();
        });

    }

    window.__supportThemeDocClick = () => {
        closeAll();
    };
    document.addEventListener("click", window.__supportThemeDocClick);

    // ========================================
    // SIDEBAR & MENU HANDLER - Clean Model
    // ========================================
    const sidebar = document.querySelector(".sidebar");
    const hamburger = document.querySelector(".hamburger");
    const contentArea = document.querySelector(".content1");

    if (!sidebar) {
        console.error("Sidebar not found!");
        return;
    }

    // Helper: toggle chevron icon class
    function setArrowState(menuElement, isOpen) {
        const arrow = menuElement.querySelector(".menu-arrow");
        if (!arrow) return;
        arrow.classList.toggle("fa-chevron-up", !!isOpen);
        arrow.classList.toggle("fa-chevron-down", !isOpen);
    }

    // Ensure correct initial state on load (tablet/mobile should start hidden)
    function enforceResponsiveState() {
        const w = window.innerWidth;
        if (w <= 1200) {
            sidebar.classList.remove("collapsed");
            if (!sidebar.classList.contains("open")) {
                sidebar.classList.remove("open");
                contentArea && contentArea.classList.remove("dimmed");
            }
        } else {
            sidebar.classList.remove("open");
            contentArea && contentArea.classList.remove("dimmed");
        }
        // Sync chevron icons with current state
        sidebar.querySelectorAll(".menu-parent").forEach(menu => {
            setArrowState(menu, menu.classList.contains("active"));
        });
    }

    enforceResponsiveState();

    // Update on resize so tablet/desktop switches behave
    let resizeTimer;
    window.__supportThemeResizeHandler = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(enforceResponsiveState, 120);
    };
    window.addEventListener("resize", window.__supportThemeResizeHandler);

    // Hamburger toggle
    function handleSidebarToggle() {
        if (window.innerWidth <= 900) {
            sidebar.classList.toggle("open");
            contentArea && contentArea.classList.toggle("dimmed");
        } else {
            sidebar.classList.toggle("collapsed");
            if (sidebar.classList.contains("collapsed")) {
                sidebar.querySelectorAll(".menu-parent.active").forEach(menu => {
                    if (!menu.querySelector(".active-menu")) {
                        menu.classList.remove("active");
                        setArrowState(menu, false);
                    }
                });
            } else {
                reapplyActiveStates();
            }
        }
    }

    // Function to reapply active states when sidebar is toggled
    function reapplyActiveStates() {
        const activeLinks = sidebar.querySelectorAll(".side-nav-link.active-menu");
        activeLinks.forEach(link => {
            let parent = link.closest(".menu-parent");
            while (parent) {
                if (!parent.classList.contains("active")) {
                    parent.classList.add("active");
                }
                setArrowState(parent, true);
                const parentId = parent.getAttribute("data-parent-id");
                parent = parentId ? sidebar.querySelector(`[data-menu-id="${parentId}"]`) : null;
            }
        });
        // Also ensure non-active menus show chevron-down
        sidebar.querySelectorAll(".menu-parent").forEach(menu => {
            if (!menu.classList.contains("active")) setArrowState(menu, false);
        });
    }

    if (hamburger) {
        window.__supportThemeHamburgerEl = hamburger;
        window.__supportThemeHamburgerClickHandler = e => {
            e.stopPropagation();
            handleSidebarToggle();
        };
        hamburger.addEventListener("click", window.__supportThemeHamburgerClickHandler);
    }

    // Handle Opportunity link click to navigate and reload
    const opportunityLink = sidebar.querySelector(".customer-analysis-link");
    if (opportunityLink) {
        opportunityLink.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = "/app/query-report/Customers%20Analysis";
        });
    }

    const renewalAnalysisLink = sidebar.querySelector(".renewal-analysis-link");
    if (renewalAnalysisLink) {
        renewalAnalysisLink.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = "/app/query-report/Renewal%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&based_on=End+Date&group_by=Renewals";
        });
    }

    const renewalListLink = sidebar.querySelector(".renewal-list-link");
    if (renewalListLink) {
        renewalListLink.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = "/app/renewal-list";
        });
    }

    const appointmentLink = sidebar.querySelector(".appointment-link");

    if (appointmentLink) {
        appointmentLink.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            const roles = (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || frappe.user_roles || [];

            //Admin should NEVER get filtered view
            if (roles.includes("Administrator")) {
                window.location.href = "/app/appointment";
                return;
            }

            const supportRoles = new Set([
                "L1 - Tech Support",
                "L2 - Tech Support",
                "Tech Support",
            ]);

            const isSupportUser = roles.some(role => supportRoles.has(role));

            if (isSupportUser) {
                frappe.route_options = { user: frappe.session.user };
                frappe.set_route("List", "Appointment");
                return;
            }

            // Default (no filter)
            window.location.href = "/app/appointment";
        });
    }


    const customcalendarLink = sidebar.querySelector(".custom-calendar-link");
    if (customcalendarLink) {
        customcalendarLink.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = "/app/custom-calendar-view";
        });
    }

    // Function to close all menus (but preserve active-menu classes)
    function closeAllMenus() {
        sidebar.querySelectorAll(".menu-parent.active").forEach(menu => {
            // Don't close menus that contain the active item
            if (!menu.querySelector(".active-menu")) {
                menu.classList.remove("active");
            }
        });
    }

    // Function to toggle a specific menu
    function toggleMenu(menuElement, forceOpen = false) {
        if (!menuElement) return;

        const menuId = menuElement.getAttribute("data-menu-id");
        const isCurrentlyActive = menuElement.classList.contains("active");
        const isNested = menuElement.classList.contains("menu-nested");
        const parentId = menuElement.getAttribute("data-parent-id");

        if (sidebar.classList.contains("collapsed")) return;

        if (forceOpen) {
            menuElement.classList.add("active");
            setArrowState(menuElement, true);
        } else if (isCurrentlyActive) {
            menuElement.classList.remove("active");
            setArrowState(menuElement, false);
            if (menuId) {
                const children = sidebar.querySelectorAll(`[data-parent-id="${menuId}"]`);
                children.forEach(child => {
                    child.classList.remove("active");
                    setArrowState(child, false);
                });
            }
        } else {
            menuElement.classList.add("active");
            setArrowState(menuElement, true);
            if (isNested && parentId) {
                const parentMenu = sidebar.querySelector(`[data-menu-id="${parentId}"]`);
                if (parentMenu && !parentMenu.classList.contains("active")) {
                    parentMenu.classList.add("active");
                    setArrowState(parentMenu, true);
                }
            }
        }
    }

    // Event delegation for menu clicks
    window.__supportThemeSidebarEl = sidebar;
    window.__supportThemeSidebarClickHandler = function (e) {
        // Accept clicks on the link and directly on the chevron icon.
        const menuHit = e.target.closest(".menu-toggle, .menu-arrow");
        if (menuHit) {
            e.preventDefault();
            e.stopPropagation();

            const menuParent = menuHit.closest(".menu-parent");
            //console.log("Found menu parent:", menuParent);

            if (menuParent) {
                const menuId = menuParent.getAttribute("data-menu-id");
                //console.log("Toggling menu:", menuId);
                toggleMenu(menuParent);
            }
        }
    };
    sidebar.addEventListener("click", window.__supportThemeSidebarClickHandler, true); // Use capture phase to catch events early

    // Close sidebar and menus on outside click (mobile only)
    window.__supportThemeMobileOutsideClick = function (e) {
        if (window.innerWidth > 900) return;
        if (!sidebar || !hamburger) return;

        if (
            sidebar.classList.contains("open") &&
            !sidebar.contains(e.target) &&
            !hamburger.contains(e.target)
        ) {
            sidebar.classList.remove("open");
            contentArea && contentArea.classList.remove("dimmed");
            // Don't completely close menus on mobile - just close the sidebar
            // Menu states are preserved
        }
    };
    document.addEventListener("click", window.__supportThemeMobileOutsideClick);



    //global search
    // console.log("🔍 Initializing Global Search...");

    const $input = $(".search-input");
    if (!$input.length) {
        //console.warn(" Missing .search-input input");
        return;
    }

    let $dropdown = null;

    function clearSearchResults() {
        if ($dropdown) {
            $dropdown.remove();
            $dropdown = null;
            $(document).off("click.searchDropdown");
        }
    }

    function showSearchResults(results, searchText) {
        clearSearchResults();

        const $searchBar = $input.closest(".search-outer");
        $searchBar.css("position", "relative");

        $dropdown = $('<div class="search-results-dropdown"></div>').css({
            position: "absolute",
            top: "100%",
            left: 0,
            background: "#fff",
            color: "#4c4c5d",
            border: "1px solid #ddd",
            width: "100%",
            zIndex: 9999,
            maxHeight: "300px",
            overflowY: "auto",
            display: "none",
        });

        $searchBar.append($dropdown);

        const regex = new RegExp(`(${searchText})`, "ig");

        results.forEach(item => {
            const label = item.label || item.name || item.doctype || item.value;
            const highlightedLabel = label.replace(regex, "<mark>$1</mark>");
            const $item = $('<div class="search-item"></div>')
                .css({ padding: "5px 10px", cursor: "pointer" })
                .html(highlightedLabel);

            $item.hover(
                () => $item.css("background", "#f8f9fa"),
                () => $item.css("background", "white")
            );

            //$item.on("click", () => frappe.set_route("Form", item.doctype, item.value));
            $item.on("click", () => {
                $input.val("");
                clearSearchResults();
                frappe.set_route("Form", item.doctype, item.value);
            });

            $dropdown.append($item);
        });

        $dropdown.show();

        $(document).on("click.searchDropdown", (e) => {
            if (!$(e.target).closest($searchBar).length) clearSearchResults();
        });
    }

    $input.off("input").on(
        "input",
        frappe.utils.debounce(function () {
            const txt = $(this).val().trim();
            //console.log("🔎 Search text:", txt);
            if (!txt) {
                clearSearchResults();
                return;
            }

            frappe.call({
                method: "renewal_module.api.global_search",
                args: { txt },
                callback: (r) => {
                    if (r.message && r.message.length) {
                        showSearchResults(r.message, txt);
                    } else {
                        clearSearchResults();
                    }
                },
            });
        }, 300)
    );

    /***Notification dropdown */
    let notificationOffset = 0;
    const pageLength = 10;
    let totalUnread = 0;
    let isLoadingNotifications = false;

    /* ----------------------------------
     * Load Notifications
     * ---------------------------------- */
    function loadNotifications(reset = false) {

        //console.log("[Notifications] loadNotifications | reset:", reset);

        if (isLoadingNotifications) {
            console.warn("[Notifications] Already loading, skipping");
            return;
        }

        isLoadingNotifications = true;

        if (reset) {
            notificationOffset = 0;
            totalUnread = 0;
            const list = document.getElementById("notification-list");
            if (list) list.innerHTML = "";
        }

        //console.log("[Notifications] Calling API with offset:", notificationOffset);

        frappe.call({
            method: "renewal_module.api.get_user_notifications",
            args: { offset: notificationOffset, limit: pageLength },
            callback: (r) => {

                isLoadingNotifications = false;

                // console.log("[Notifications] API response:", r.message);

                const notifications = r.message || [];
                const container = document.getElementById("notification-list");
                const seeMoreBtn = document.getElementById("see-more-btn");

                if (!container) {
                    console.error("[Notifications] Missing notification-list");
                    return;
                }

                if (notifications.length === 0) {
                    console.warn("[Notifications] No more notifications");
                    if (seeMoreBtn) seeMoreBtn.style.display = "none";
                    return;
                }

                notifications.forEach((n, idx) => {

                    //console.log("[Notifications] Render item", idx, n.name);

                    const safeHtml =
                        typeof DOMPurify !== "undefined"
                            ? DOMPurify.sanitize(String(n.subject || ""))
                            : frappe.utils.escape_html(String(n.subject || ""));

                    const item = document.createElement("div");
                    item.className = "notification-item text-wrap";
                    item.innerHTML = `
                        <span class="notif-dot ${n.read ? "read" : "unread"}"></span>
                        <div>
                        <div class="notif-title">${safeHtml}</div>
                        <div class="notif-time">${frappe.datetime.prettyDate(n.creation)}</div>
                        </div>
                    `;
                    //console.log("item", item);

                    item.addEventListener("click", (e) => {
                        e.stopPropagation(); // prevent button toggle
                        //console.log("[Notifications] Clicked:", n.name);
                        markAsRead(n, item);
                    });

                    container.appendChild(item);
                });

                // ✅ Update offset correctly
                notificationOffset += notifications.length;
                //console.log("[Notifications] New offset:", notificationOffset);

                // ✅ Update unread count
                const unreadCount = notifications.filter(n => !n.read).length;
                totalUnread += unreadCount;
                updateBadge(totalUnread);

                // ✅ Update total text
                const totalEl = document.getElementById("total-notifications");
                if (totalEl) {
                    totalEl.innerText = `${notificationOffset}`;
                }

                // ✅ Show / hide See More
                if (seeMoreBtn) {
                    seeMoreBtn.style.display =
                        notifications.length < pageLength ? "none" : "block";
                }
            }
        });
    }

    function markAsRead(notification, element) {

        if (notification.read) return;

        //console.log("[Notifications] Marking read:", notification.name);

        frappe.call({
            method: "renewal_module.api.mark_notification_as_read",
            args: { notification_name: notification.name },
            callback: () => {

                const dot = element.querySelector(".notif-dot");
                if (dot) {
                    dot.classList.remove("unread");
                    dot.classList.add("read");
                }

                notification.read = 1;
                if (totalUnread > 0) totalUnread--;
                updateBadge(totalUnread);

                //console.log("[Notifications] Marked read:", notification.name);
            }
        });
    }


    function updateBadge(count) {
        //console.log("[Notifications] Badge update:", count);
        const badge = document.getElementById("notifCount");
        if (!badge) return;

        if (count > 0) {
            badge.innerText = count;
            badge.classList.remove("d-none");
        } else {
            badge.classList.add("d-none");
        }
    }


    const seeMoreBtn = document.getElementById("see-more-btn");

    if (seeMoreBtn) {
        seeMoreBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation(); // 🔥 VERY IMPORTANT (inside button)
            //console.log("[Notifications] See More clicked");
            loadNotifications(false);
        });
    }

    frappe.after_ajax(() => {
        //console.log("[Notifications] Initial load");
        loadNotifications(true);
    });


    const avatarEl = document.getElementById("topbar-user-avatar1");
    if (!avatarEl) {
        console.warn("Missing #topbar-user-avatar element");
        return;
    }

    console.log("Sidebar elements");

    // frappe.db.get_value("User", frappe.session.user, ["user_image", "full_name"])
    //     .then(r => {
    //         if (!r || !r.message) return;
    //         const { user_image, full_name } = r.message;

    //         if (user_image) {
    //             avatarEl.innerHTML = `
    // 				<img src="${user_image}" width="32" height="32" class="rounded-circle1" alt="user-image">
    // 			`;
    //         } else {
    //             const firstLetter = (full_name || frappe.session.user || "?").charAt(0).toUpperCase();
    //             avatarEl.textContent = firstLetter;
    //         }
    //     })
    //     .catch(err => console.error("Failed to load user avatar:", err));

    frappe.db.get_value("User", frappe.session.user, ["user_image", "full_name"])
        .then(r => {
            if (!r || !r.message) return;
            const { user_image, full_name } = r.message;

            // 1. Populate Topbar User Avatar
            if (user_image) {
                avatarEl.innerHTML = `
					<img src="${user_image}" width="32" height="32" class="rounded-circle1" alt="user-image">
				`;
            } else {
                const firstLetter = (full_name || frappe.session.user || "?").charAt(0).toUpperCase();
                avatarEl.textContent = firstLetter;
            }

            // 2. Populate Sidebar User Details
            const sidebarAvatar = document.getElementById("sidebar-user-avatar");
            const sidebarName = document.getElementById("sidebar-user-name");
            const sidebarRole = document.getElementById("sidebar-user-role");
            

            if (sidebarName) {
                const nameVal = full_name || frappe.session.user;
                sidebarName.textContent = nameVal;
                sidebarName.setAttribute("title", nameVal);
            }

            if (sidebarRole) {
                frappe.db.get_value("Employee", { user_id: frappe.session.user }, "designation")
                    .then(empRes => {
                        let roleVal = "User";
                        if (empRes && empRes.message && empRes.message.designation) {
                            roleVal = empRes.message.designation;
                        } else {
                            const displayRoles = (frappe.user_roles || []).filter(role => !["All", "Guest"].includes(role));
                            roleVal = displayRoles[0] || "User";
                        }
                        sidebarRole.textContent = roleVal;
                        sidebarRole.setAttribute("title", roleVal);
                    })
                    .catch(() => {
                        const displayRoles = (frappe.user_roles || []).filter(role => !["All", "Guest"].includes(role));
                        const roleVal = displayRoles[0] || "User";
                        sidebarRole.textContent = roleVal;
                        sidebarRole.setAttribute("title", roleVal);
                    });
            }

            if (sidebarAvatar) {
                if (user_image) {
                    sidebarAvatar.innerHTML = `
                        <img src="${user_image}" alt="user-image">
                    `;
                } else {
                    const firstLetter = (full_name || frappe.session.user || "?").charAt(0).toUpperCase();

                    sidebarAvatar.textContent = firstLetter;
                }
            }
        })
        .catch(err => console.error("Failed to load user avatar details:", err));


}


function applyRoleBasedSidebar() {
    const roles = new Set(frappe.user_roles || []);
    const isAdmin = roles.has("Administrator");
    let pagePermissions = {};
    let reportPermissions = {};

    /**
     * Fetch page and report roles from backend
     * Returns: { pages: {page: [roles]}, reports: {report: [roles]} }
     */
    async function fetchPermissionsFromDoctype() {
        try {
            const response = await frappe.call({
                method: "renewal_module.api.get_page_and_report_permissions",
                async: true
            });
            if (response && response.message) {
                pagePermissions = response.message.pages || {};
                reportPermissions = response.message.reports || {};
                return { pagePermissions, reportPermissions };
            }
            return { pagePermissions: {}, reportPermissions: {} };
        } catch (error) {
            console.error("❌ Error fetching permissions:", error);
            return { pagePermissions: {}, reportPermissions: {} };
        }
    }

    /**
     * Check if user has permission to access a page or report
     * @param {string} pageId - The data-page value / page name
     * @param {string} reportId - The data-report value / report name
     * @returns {boolean} - True if user can access, false otherwise
     */
    function userCanAccess(pageId, reportId) {
        if (isAdmin) return true;
        if (reportId) {
            const requiredRoles = reportPermissions[reportId];
            if (!requiredRoles) return true;
            return requiredRoles.some(role => roles.has(role));
        }
        if (pageId) {
            const requiredRoles = pagePermissions[pageId];
            if (!requiredRoles) return true;
            return requiredRoles.some(role => roles.has(role));
        }
        return true;
    }

    function itemHasVisibleChildren(item) {
        if (!item.classList.contains("menu-nested")) return false;
        const subMenu = item.querySelector(".sub-menu");
        if (!subMenu) return false;
        const children = subMenu.querySelectorAll(":scope > .side-nav-item");
        for (let child of children) {
            if (child.style.display !== "none") {
                if (child.classList.contains("menu-nested")) {
                    if (itemHasVisibleChildren(child)) return true;
                } else {
                    return true;
                }
            }
        }
        return false;
    }

    function hideMenuItem(item) {
        item.style.display = "none";
        if (item.classList.contains("menu-nested")) {
            const subMenu = item.querySelector(".sub-menu");
            if (subMenu) {
                subMenu.querySelectorAll(".side-nav-item").forEach(child => hideMenuItem(child));
            }
        }
    }

    function applyPermissionsToItem(item) {
        const link = item.querySelector(".side-nav-link");
        const pageId = link ? link.getAttribute("data-page") : null;
        const reportId = link ? link.getAttribute("data-report") : null;
        if ((pageId || reportId) && !userCanAccess(pageId, reportId)) {
            hideMenuItem(item);
            return;
        }
        if (item.classList.contains("menu-nested")) {
            const subMenu = item.querySelector(".sub-menu");
            if (subMenu) {
                subMenu.querySelectorAll(":scope > .side-nav-item").forEach(child => applyPermissionsToItem(child));
            }
            if (!itemHasVisibleChildren(item)) {
                hideMenuItem(item);
            }
        } else if (!pageId && !reportId) {
            hideMenuItem(item);
        }
    }

    function menuHasVisibleChildren(menuParent) {
        const subMenu = menuParent.querySelector(".sub-menu");
        if (!subMenu) return false;
        const children = subMenu.querySelectorAll(":scope > .side-nav-item");
        for (let child of children) {
            if (child.style.display !== "none") {
                if (child.classList.contains("menu-nested")) {
                    if (itemHasVisibleChildren(child)) return true;
                } else {
                    return true;
                }
            }
        }
        return false;
    }

    function applyRoleFiltering() {
        const sidebar = document.querySelector(".sidebar");
        if (!sidebar) return;
        const menuParents = sidebar.querySelectorAll(".menu-parent");
        menuParents.forEach(menuParent => {
            const subMenu = menuParent.querySelector(".sub-menu");
            if (subMenu) {
                subMenu.querySelectorAll(":scope > .side-nav-item").forEach(item => applyPermissionsToItem(item));
            }
            if (!menuHasVisibleChildren(menuParent)) {
                menuParent.style.display = "none";
            }
        });
    }

    fetchPermissionsFromDoctype().then(() => {
        applyRoleFiltering();
    }).catch((error) => {
        console.error("❌ Failed to apply role-based sidebar:", error);
        applyRoleFiltering();
    });
}


