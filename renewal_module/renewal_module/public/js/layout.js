window.customLayoutLoaded = false;

window.load_custom_layout = function(wrapper) {
    if (window.customLayoutLoaded) return;

    $(wrapper).prepend(`
        <div id="custom-navbar"></div>
        <div id="custom-sidebar"></div>
        <div id="custom-page-content"></div>
    `);

    $("#custom-navbar").load("/support_theme");
    // $("#custom-sidebar").load("/custom_sidebar");

    window.customLayoutLoaded = true;
};
