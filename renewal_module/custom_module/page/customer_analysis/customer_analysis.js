frappe.pages['customer-analysis'].on_page_load = function(wrapper) {
    // placeholder - doesn't need a full page on load
};

frappe.pages['customer-analysis'].on_page_show = function(wrapper) {
    console.log("🔄 customer analysis page showing");
    const pageWrapper = wrapper || $(".page")[0] || document.body;

    const ensureSupportLayoutLoaded = (cb) => {
        if (typeof loadSupportLayout === "function") return cb();

        frappe.require([
            "/assets/renewal_module/js/issue_themes/support_layout2.js"
        ], () => setTimeout(cb, 10));

        frappe.require([
            "/assets/renewal_module/css/issue_themes/support_theme2.css",
        ]);
    };

    ensureSupportLayoutLoaded(() => {
        // We expect support layout to provide #support-page-content
        // Render a simple customer analysis view into that content area
        const renderIntoContent = () => {
            const $content = $("#support-page-content");
            if (!$content.length) {
                setTimeout(renderIntoContent, 50);
                return;
            }

            $content.empty();

            const html = `
                <div class="wrapper customer-analysis-wrapper">
                    <div class="row">
                        <div class="col-12">
                            <h3>Customer Analysis</h3>
                            <p>This is a placeholder customer analysis report. Replace with actual UI and API calls.</p>
                            <div id="customer-analysis-table">Loading...</div>
                        </div>
                    </div>
                </div>
            `;

            $content.append(html);

            // Example: fetch summary counts (API method may not exist yet)
            try {
                frappe.call({
                    method: "renewal_module.api.get_customer_analysis_summary",
                    callback: function(r) {
                        const data = (r && r.message) || { summary: 'No data' };
                        $('#customer-analysis-table').html(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
                    },
                    error: function() {
                        $('#customer-analysis-table').html('<div class="text-muted">No analysis API available.</div>');
                    }
                });
            } catch (e) {
                $('#customer-analysis-table').html('<div class="text-muted">Error loading analysis.</div>');
            }
        };

        renderIntoContent();
    });
};
