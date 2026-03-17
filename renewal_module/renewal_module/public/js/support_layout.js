// Global flag – ensures layout loads only once
window.supportLayoutLoaded = false;

window.loadSupportLayout = function (wrapper) {

    // If layout already exists, do nothing
    if (window.supportLayoutLoaded) {
        return;
    }

    // Clear frappe page wrapper
    $(wrapper).empty();

    // Inject layout container
    $(wrapper).append(`
        <div id="support-layout-root"></div>
    `);

    // Load layout HTML (navbar + sidebar)
    $("#support-layout-root").load(
        "/support_nav",
        function () {
            // Initialize navbar & sidebar JS
            if (window.initSupportNavbar) {
                window.initSupportNavbar();
            }

            window.supportLayoutLoaded = true;
        }
    );
};
