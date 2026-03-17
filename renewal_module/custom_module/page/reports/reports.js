// frappe.pages['reports'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'None',
// 		single_column: true
// 	});
// }

frappe.pages['reports'].on_page_load = (wrapper) => {
    // 	console.log("on_page_load triggered");
    new reportsPage(wrapper);
};

frappe.router.on('change', () => {
    const route = frappe.get_route();
    const current_page = route[0];
    console.log("Route changed:", route.join("/"));

    if (current_page !== "reports") {
        console.log("Cleaning up reports assets...");
        frappe.reports_page.cleanup();
    }
    // coming back to issue-theme-details
    if (current_page === "reports") {
        console.log("Re-initializing assets...");
        //frappe.issue_theme_details_page.reapply();
        setTimeout(() => {
            frappe.reports_page.reapply();
        }, 300);

    }
});

if (!window.MyreportsPageDefined) {
    window.MyreportsPageDefined = true;

    class reportsPage {
        constructor(wrapper) {
            this.wrapper = wrapper;
            this.page = frappe.ui.make_app_page({
                parent: wrapper,
                title: '',
                single_column: true
            });
            // cache for assets (if you use it)
            this._cache = {
                css: [],
                js: [],
                inlineScripts: [],
                rendered_html: null
            };

            this.make();
            // convenience reference (matches your previous usage)
            frappe.reports_page = this.createAssetManager ? this.createAssetManager(this, "reports") : this;
        }

        // ---- lifecycle / UI build ----
        make() {
            if (frappe.reports_page && frappe.reports_page.body) {
                $(this.page.main).append(frappe.reports_page.body);
            }
            // load support page HTML + assets
            this.load_support_page();
            // Load ERPNext report inside this page
            this.load_report("Opportunity Data");  // <<< Change report name here
            this.loaddata();
        }

        // -------------------------------
        // ⭐ MAIN FUNCTION TO LOAD REPORT
        // -------------------------------
       load_report(report_name) {
    frappe.require("desk.bundle.js", () => {

        frappe.after_ajax(() => {
            const container = $("<div/>", { class: "embedded-report-container" })
                .css({ padding: "0px" })
                .appendTo(this.page.main);

            // Render report only after page is fully built
            setTimeout(() => {
                const report_view = new frappe.views.ReportView({
                    parent: container,
                    report_name: report_name,
                    page: this.page
                });

                report_view.show();
            }, 200); // small timeout fixes DOM readiness
        });

    });
}




        load_support_page() {
            console.log("Loading support page...");
            return new Promise((resolve, reject) => {
                frappe.call({
                    method: "renewal_module.api.get_support_page",
                    callback: (r) => {
                        if (r.message && r.message.ok && r.message.rendered_html) {
                            this.process_and_render_html(r.message.rendered_html).then(resolve);
                        } else {
                            console.error("Failed to load support page template", r);
                            $(this.page.main).find(".wrapper")
                                .prepend("<p class='text-danger'>Failed to load support page template.</p>");
                            reject();
                        }
                    }
                });
            });
        }


        // main injection function
        async process_and_render_html(html) {
            console.group("Asset Injection & HTML Rendering");
            const temp = document.createElement("div");
            temp.innerHTML = html;

            // --- CSS injection ---
            temp.querySelectorAll('link[href]').forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                if (!this._cache.css.includes(href)) this._cache.css.push(href);

                if (!document.querySelector(`link[href="${href}"][data-reports="true"]`)) {
                    const css = document.createElement('link');
                    css.rel = 'stylesheet';
                    css.href = href;
                    css.dataset.reports = "true";
                    document.head.appendChild(css);
                    //console.log(`CSS injected: ${href}`);
                }
            });

            // --- JS injection ---
            const scriptPromises = [];
            temp.querySelectorAll('script[src]').forEach(script => {
                const src = script.getAttribute('src');
                if (!src) return;
                if (!this._cache.js.includes(src)) this._cache.js.push(src);

                if (!document.querySelector(`script[src="${src}"][data-reports="true"]`)) {
                    const promise = new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = src;
                        s.defer = true;
                        s.dataset.reports = "true";
                        s.onload = () => {
                            //console.log(`Loaded JS: ${src}`);
                            resolve(src);
                        };
                        s.onerror = () => {
                            //console.warn(`Failed to load JS: ${src}`); 
                            reject(src);
                        };
                        document.body.appendChild(s);
                    });
                    scriptPromises.push(promise);
                }
            });

            // --- Inline script collection ---
            this._cache.inlineScripts = [];
            temp.querySelectorAll('script:not([src])').forEach(script => {
                const code = script.textContent?.trim();
                if (code) this._cache.inlineScripts.push(code);
                script.remove();
            });

            this._cache.rendered_html = temp.innerHTML;
            temp.querySelectorAll('style').forEach(styleTag => {
                styleTag.dataset.reports = "true";
            });

            temp.querySelectorAll('link, script').forEach(tag => tag.remove());

            const $wrapper = $(this.page.main).find('.wrapper');
            const $contentPage = $wrapper.find('.content-page').first();

            if ($contentPage.length) $contentPage.before(temp.innerHTML);
            else $wrapper.prepend(temp.innerHTML);
            //console.groupEnd();

            try {
                await Promise.allSettled(scriptPromises);
                //console.log("Scripts loaded, executing inline code...");
                this._cache.inlineScripts.forEach(code => {
                    try { new Function(code)(); } catch (err) { console.error("Inline script error:", err); }
                });
                this.initialize_theme_scripts();
                setTimeout(() => this.reinit_bootstrap_ui(), 300);
            } catch (err) {
                console.error("Script load error:", err);
            }

            frappe.reports_page = this.createAssetManager(this);
        }

        initialize_theme_scripts() {
            try {
                if (typeof App !== "undefined") new App().init();
                if (typeof LayoutCustomizer !== "undefined") new LayoutCustomizer().init();
                if (typeof Plugins !== "undefined") new Plugins().init();
                if (typeof I18nManager !== "undefined") new I18nManager().init();
            } catch (err) {
                console.error("Theme init failed:", err);
            }
        }

        reinit_bootstrap_ui() {
            try {
                console.group("Reinitializing Bootstrap UI components");
                // bootstrap v5 detection
                if (window.bootstrap && bootstrap.Dropdown) {
                    document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
                        try { new bootstrap.Dropdown(el); } catch (_) { }
                    });
                    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                        try { new bootstrap.Tooltip(el); } catch (_) { }
                    });
                    document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
                        try { new bootstrap.Popover(el); } catch (_) { }
                    });
                } else if (window.jQuery && $.fn.dropdown) {
                    $('[data-toggle="dropdown"]').dropdown();
                    $('[data-toggle="tooltip"]').tooltip();
                    $('[data-toggle="popover"]').popover();
                }
                //console.log("Dropdowns, tooltips, popovers reinitialized");
                console.groupEnd();
            } catch (err) {
                console.error("Failed to reinitialize Bootstrap UI:", err);
            }
        }

        createAssetManager(instance) {
            const pageWrapperSelector = () => {
                const pageMain = instance.page && instance.page.main ? instance.page.main : document;
                return $(pageMain).find('.wrapper').get(0);
            };

            return {
                cleanup() {
                    console.group("🧹 Cleaning up new-issue assets");
                    let removed_css = 0, removed_js = 0, removed_style = 0;
                    if (!frappe.reports_page) frappe.reports_page = {};
                    frappe.reports_page._inline_styles_backup = [];

                    const cache = instance._cache || { css: [], js: [] };
                    cache.css.forEach(href => {
                        const el = document.querySelector(`link[href="${href}"][data-reports="true"]`);
                        if (el) {
                            el.remove();
                            removed_css++;
                        }
                    });

                    // fallback: if any leftover support_dashboard.css without tag
                    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                        const href = link.getAttribute('href') || "";
                        if (href.includes("reports.css")) {
                            link.remove();
                            removed_css++;
                        }
                    });

                    cache.js.forEach(src => {
                        const el = document.querySelector(`script[src="${src}"]`);
                        const lower_src = src.toLowerCase();
                        // Do NOT remove Popper — critical bootstrap dependency
                        if (lower_src.includes("popper")) {
                            console.warn("Skipping Popper REMOVE — global dependency:", src);
                            return;
                        }
                        if (el) {
                            el.remove();
                            removed_js++;
                        }
                    });

                    // --- 3. Remove inline <style> tags added dynamically ---
                    document.querySelectorAll('style').forEach(el => {
                        const text = el.textContent.trim();
                        if (text.includes('.reports') || text.includes('#reports') || el.dataset.reports === "true") {
                            try {
                                frappe.reports_page._inline_styles_backup.push(text);
                            } catch (err) { }
                            el.remove();
                            removed_style++;
                        }
                    });

                    // --- 4. Remove injected HTML inside wrapper except .content-page ---
                    const wrapperEl = pageWrapperSelector();
                    if (wrapperEl) {
                        Array.from(wrapperEl.children).forEach(child => {
                            if (!child.classList.contains('content-page')) child.remove();
                        });
                    }

                    console.log(`Cleanup completed — removed ${removed_css} CSS, ${removed_js} JS, ${removed_style} inline styles.`);
                    console.groupEnd();
                },

                reapply() {
                    console.group("Reapplying new-issue assets");
                    (instance._cache.css || []).forEach(href => {
                        if (!document.querySelector(`link[href="${href}"]`)) {
                            const css = document.createElement('link');
                            css.rel = 'stylesheet';
                            css.href = href;
                            css.dataset.reports = "true";
                            document.head.appendChild(css);
                        }
                    });

                    const jsPromises = (instance._cache.js || []).map(src => {
                        return new Promise((resolve) => {
                            if (document.querySelector(`script[src="${src}"]`)) {
                                return resolve();
                            }
                            const s = document.createElement('script');
                            s.src = src;
                            s.defer = true;
                            s.dataset.reports = "true";
                            s.onload = () => { console.log("Re-loaded JS:", src); resolve(); };
                            s.onerror = () => { console.warn("Failed to reload JS:", src); resolve(); };
                            document.body.appendChild(s);
                        });
                    });

                    Promise.allSettled(jsPromises).then(() => {
                        const wrapperEl = pageWrapperSelector();
                        if (wrapperEl) {
                            Array.from(wrapperEl.children).forEach(child => {
                                if (!child.classList.contains('content-page')) child.remove();
                            });

                            if (instance._cache.rendered_html) {
                                const frag = document.createRange().createContextualFragment(instance._cache.rendered_html);
                                const contentEl = wrapperEl.querySelector('.content-page');
                                if (contentEl) wrapperEl.insertBefore(frag, contentEl);
                                else wrapperEl.prepend(frag);
                            }
                        }

                        (instance._cache.inlineScripts || []).forEach(code => {
                            try {
                                const fn = new Function(code);
                                fn();
                            } catch (err) {
                                console.error("Inline script re-exec error:", err);
                            }
                        });

                        try {
                            instance.initialize_theme_scripts();
                        } catch (err) {
                            console.error("Error during re-initialize theme scripts:", err);
                        }
                        setTimeout(() => instance.reinit_bootstrap_ui(), 500);
                        console.groupEnd();
                    });
                }
            };
        }

        // loaddata() {
        //     console.log("loaddata called");
        //     frappe.call({
        //         method: "renewal_module.custom_module.page.reports.reports.loaddata",
        //         callback: (r) => {
        //             if (r.message && r.message) {
        //                 console.log("Data loaded:", r.message);
        //             }
        //         }
        //     })
        // }

        loaddata() {
            console.log("loaddata called");

            frappe.call({
                method: "renewal_module.custom_module.page.reports.reports.loaddata",
                callback: (r) => {
                    if (!r.message) {
                        console.log("No data received");
                        return;
                    }

                    console.log("Data loaded:", r.message);

                    let data = Array.isArray(r.message) ? r.message : [r.message];

                    let table = document.getElementById("dynamic-table");
                    let thead = table.querySelector("thead");
                    let tbody = table.querySelector("tbody");

                    let leftCol = $(".leftcol");
                    let rightCol = $(".rightcol");

                    thead.innerHTML = "";
                    tbody.innerHTML = "";

                    // ----------------------------------------------------------
                    // CREATE THEAD WITH SELECT ALL CHECKBOX
                    // ----------------------------------------------------------
                    let keys = Object.keys(data[0]);
                    keys = keys.filter(key => key !== "item_row");
                    let headRow = `
                        <tr>
                            <th title="Select All"><input type="checkbox" id="select-all"></th>
                    `;

                    keys.forEach(key => {
                        const label = key.replace(/_/g, " ").toUpperCase();
                        headRow += `<th title="${label}">${label}</th>`;
                    });

                    headRow += `</tr>`;
                    thead.innerHTML = headRow;

                    // ----------------------------------------------------------
                    // BUILD TBODY
                    // ----------------------------------------------------------
                    let rowsHTML = "";

                    data.forEach(row => {
                        rowsHTML += `<tr class="data-row" data-row='${JSON.stringify(row)}'>`;
                        rowsHTML += `<td><input type="checkbox" class="row-check"></td>`;

                        keys.forEach(key => {
                            const value = row[key] ?? "";
                            rowsHTML += `<td title="${value}">${value}</td>`;
                        });

                        rowsHTML += `</tr>`;
                    });

                    tbody.innerHTML = rowsHTML;

                    // ----------------------------------------------------------
                    // SELECT ALL CHECKBOX LOGIC
                    // ----------------------------------------------------------
                    const selectAll = document.getElementById("select-all");
                    const checkboxes = tbody.querySelectorAll(".row-check");

                    selectAll.addEventListener("change", () => {
                        checkboxes.forEach(cb => {
                            cb.checked = selectAll.checked;
                            cb.closest("tr").classList.toggle("row-selected", cb.checked);
                        });
                    });

                    checkboxes.forEach(cb => {
                        cb.addEventListener("change", () => {
                            cb.closest("tr").classList.toggle("row-selected", cb.checked);
                            if (!cb.checked) selectAll.checked = false;
                        });
                    });

                    // ----------------------------------------------------------
                    // ROW CLICK → OPEN RIGHT PANEL (TOGGLE)
                    // ----------------------------------------------------------
                    let activeRow = null;

                    tbody.querySelectorAll(".data-row").forEach(rowEl => {

                        rowEl.addEventListener("click", (event) => {
                            // ignore checkbox click
                            if (event.target.classList.contains("row-check")) return;

                            // If clicking same row again → close
                            if (activeRow === rowEl) {
                                closeRightCard();
                                return;
                            }

                            // Remove previous highlights
                            tbody.querySelectorAll(".data-row").forEach(r => r.classList.remove("clicked-row"));

                            // Highlight selected row
                            rowEl.classList.add("clicked-row");

                            activeRow = rowEl;

                            const rowData = JSON.parse(rowEl.dataset.row);

                            let contentHTML = `<table class="table table-bordered">`;
                            Object.keys(rowData).forEach(key => {
                                let label = key.replace(/_/g, " ").toUpperCase();
                                let value = rowData[key] ?? "";
                                contentHTML += `
                            <tr>
                                <th style="width:35%">${label}</th>
                                <td>${value}</td>
                            </tr>`;
                            });
                            contentHTML += "</table>";

                            renderRightCard("Record Details", contentHTML);
                        });
                    });

                    // ----------------------------------------------------------
                    // CLOSE WHEN CLICK OUTSIDE TABLE OR RIGHT PANEL
                    // ----------------------------------------------------------
                    document.addEventListener("click", function (e) {
                        const clickInsideTable = e.target.closest("#dynamic-table");
                        const clickInsideRight = e.target.closest(".rightcol");

                        if (!clickInsideTable && !clickInsideRight) {
                            closeRightCard();
                        }
                    });

                    // ----------------------------------------------------------
                    // RIGHT PANEL RENDER FUNCTION
                    // ----------------------------------------------------------
                    function renderRightCard(title, content) {
                        rightCol.show();
                        leftCol.removeClass("col-lg-12").addClass("col-lg-8");

                        rightCol.html(`
                            <div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
                                <div class="sla-header mb-3 pb-2 border-bottom">
                                    <h5 class="sla-title fw-bold text-primary mb-0">${title}</h5>
                                </div>
                                <div class="sla-body">
                                    ${content}
                                </div>
                            </div>
                        `);
                    }

                    // ----------------------------------------------------------
                    // CLOSE RIGHT PANEL
                    // ----------------------------------------------------------
                    function closeRightCard() {
                        rightCol.hide();
                        leftCol.removeClass("col-lg-8").addClass("col-lg-12");

                        tbody.querySelectorAll(".data-row").forEach(r => r.classList.remove("clicked-row"));

                        activeRow = null;
                    }
                }
            });
        }





    }
    window.reportsPage = reportsPage;
}





frappe.reports_page = {
    body: `
        <div class="wrapper reports-wrapper">

            <div class="content-page" style="background-color:#F3F4F6;">
                <div class="container-fluid">

                    <div class="row mt-2">
                        <div class="leftcol">
                            <div class="card">
                                <div class="card-header d-flex justify-content-between align-items-center" style="border-bottom:none;">
                                    <h4 class="card-title mb-0">Duplicate Customers</h4>
                                    <div class="d-flex gap-2">
                                        <button class="btn btn-secondary btn-sm">Select All</button>
                                        <button class="btn btn-secondary btn-sm">Clear All</button>
                                        <button class="btn btn-secondary btn-sm">Refresh</button>
                                        <div class="dropdown" id="actions-dropdown">
                                            <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                                Actions
                                            </button>
                                            <ul class="dropdown-menu">
                                                <li class="user-action"><a class="dropdown-item" href="#" data-action="Download Report">Download Report</a></li>
                                            </ul>
                                        </div>
                                        <button class="btn btn-success btn-sm">Generate Report</button>
                                    </div>
                                    
                                </div>
                                <div class="card-body">
                                    <div class="d-flex gap-2 align-items-center mb-3">
                                        <div class="app-search">
                                            <select class="form-select form-control my-md-0" style="padding-left:10px;">
                                                <option selected>Select salesperson</option>
                                                <option value="1">Salesperson 1</option>
                                                <option value="2">Salesperson 2</option>
                                                <option value="3">Salesperson 3</option>
                                            </select>
                                        </div>
                                        <div class="app-search">
                                            <select class="form-select form-control my-md-0" style="padding-left:10px;">
                                                <option selected>party</option>
                                                <option value="1">party 1</option>
                                                <option value="2">party 2</option>
                                                <option value="3">party 3</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="table-responsive">
                                        <table class="table table-centered table-select table-hover w-100 mb-0" id="dynamic-table">
                                            <thead></thead>
                                            <tbody></tbody>
                                        </table>
                                    </div>
                                    
                                </div>
                            </div>
                        </div>

                        <div class="rightcol col-lg-4"></div>

                    </div>

                </div>
            </div>
        
        </div>
    `
};

/**frappe.pages['reports'].on_page_load = (wrapper) => {
    new reportsPage(wrapper);
};

frappe.router.on('change', () => {
    const route = frappe.get_route();
    const current_page = route[0];

    if (current_page !== "reports") {
        if (frappe.reports_page && frappe.reports_page.cleanup) {
            frappe.reports_page.cleanup();
        }
        return;
    }

    // When route is: reports/query-report/Report Name
    if (route[1] === "query-report") {
        const report_name = route.slice(2).join("/");
        setTimeout(() => {
            if (frappe.reports_page && frappe.reports_page.load_report) {
                frappe.reports_page.load_report(report_name);
            }
        }, 300);
    }
});


// -----------------------------------------------------------
// MAIN CLASS
// -----------------------------------------------------------
class reportsPage {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.page = frappe.ui.make_app_page({
            parent: wrapper,
            title: '',
            single_column: true
        });

        this._cache = { css: [], js: [], inlineScripts: [], rendered_html: null };

        this.make();

        // expose API
        frappe.reports_page = this.createAssetManager(this);
        frappe.reports_page.load_report = this.load_report.bind(this);
    }


    // ------------------------------------------
    // LOAD BASE TEMPLATE
    // ------------------------------------------
    make() {
        $(this.page.main).append(frappe.reports_page_template.body);
        this.load_support_page();
    }


    load_support_page() {
        return frappe.call({
            method: "renewal_module.api.get_support_page",
            callback: (r) => {
                if (r.message?.rendered_html) {
                    this.process_and_render_html(r.message.rendered_html);
                }
            }
        });
    }


    // ------------------------------------------
    // PROCESS HTML (your asset system)
    // ------------------------------------------
    async process_and_render_html(html) {
        const temp = document.createElement("div");
        temp.innerHTML = html;

        // CSS inject
        temp.querySelectorAll('link[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !document.querySelector(`link[href="${href}"]`)) {
                const tag = document.createElement('link');
                tag.rel = "stylesheet";
                tag.href = href;
                tag.dataset.reports = "true";
                document.head.appendChild(tag);
                this._cache.css.push(href);
            }
        });

        // JS inject
        const scriptPromises = [];
        temp.querySelectorAll('script[src]').forEach(script => {
            const src = script.getAttribute('src');
            if (src && !document.querySelector(`script[src="${src}"]`)) {
                this._cache.js.push(src);
                scriptPromises.push(new Promise(resolve => {
                    const s = document.createElement("script");
                    s.src = src;
                    s.defer = true;
                    s.dataset.reports = "true";
                    s.onload = resolve;
                    document.body.appendChild(s);
                }));
            }
        });

        // Inline JS
        this._cache.inlineScripts = [];
        temp.querySelectorAll('script:not([src])').forEach(s => {
            const code = s.textContent.trim();
            if (code) this._cache.inlineScripts.push(code);
            s.remove();
        });

        this._cache.rendered_html = temp.innerHTML;

        // Inject HTML
        $(".reports-wrapper .content-page").before(temp.innerHTML);

        await Promise.allSettled(scriptPromises);

        this._cache.inlineScripts.forEach(code => new Function(code)());
    }


    // -----------------------------------------------------------
    // DYNAMIC REPORT ENGINE
    // -----------------------------------------------------------

    load_report(report_name) {
        console.log("Loading report:", report_name);
        this.current_report = report_name;

        frappe.call({
            method: "frappe.desk.query_report.get_script",
            args: { report_name },
            callback: (r) => {
                if (!r.message) {
                    frappe.msgprint("Report not found.");
                    return;
                }

                this.report_meta = r.message;

                // Render filters
                this.render_filters(r.message.filters || []);

                // Load data
                this.run_report();
            }
        });
    }


    // ------------------------------------------
    // BUILD FILTER UI
    // ------------------------------------------
    render_filters(filters) {
        const container = document.querySelector(".dynamic-report-filters");
        if (!container) return;

        container.innerHTML = "";
        this.active_filter_values = {};

        filters.forEach(f => {
            const div = document.createElement("div");
            div.className = "col-md-3 mb-2";

            if (f.fieldtype === "Select") {
                const options = (f.options || "").split("\n").map(o => `<option>${o}</option>`).join("");
                div.innerHTML = `
                    <label class="form-label">${f.label}</label>
                    <select class="form-select report-filter" data-fieldname="${f.fieldname}">
                        ${options}
                    </select>
                `;
            } else {
                div.innerHTML = `
                    <label class="form-label">${f.label}</label>
                    <input class="form-control report-filter" data-fieldname="${f.fieldname}">
                `;
            }

            container.appendChild(div);
        });

        // Bind change events
        container.querySelectorAll(".report-filter").forEach(el => {
            el.addEventListener("change", () => {
                this.collect_filters();
                this.run_report();
            });
        });
    }


    collect_filters() {
        this.active_filter_values = {};
        document.querySelectorAll(".report-filter").forEach(el => {
            this.active_filter_values[el.dataset.fieldname] = el.value;
        });
    }


    // ------------------------------------------
    // RUN REPORT
    // ------------------------------------------
    run_report() {
        if (!this.current_report) {
            console.warn("No report selected.");
            return;
        }

        // small UI hint (optional)
        const tbody = document.querySelector(".dynamic-report-table-body");
        const thead = document.querySelector(".dynamic-report-table-head");
        if (thead) thead.innerHTML = `<tr><th>Loading...</th></tr>`;
        if (tbody) tbody.innerHTML = `<tr><td>Loading results...</td></tr>`;

        frappe.call({
            method: "frappe.desk.query_report.run",
            args: {
                report_name: this.current_report,
                filters: this.active_filter_values || {}
            },
            callback: (r) => {
                const msg = r.message;
                // Case 1: expected normal response with columns & result
                if (msg && msg.columns && msg.result) {
                    this.render_table(msg.columns, msg.result);
                    return;
                }

                // Case 2: prepared_report was returned -> try fetching the report payload
                if (msg && (msg.prepared_report || msg.prepared_report === true)) {
                    console.info("Prepared report returned, fetching full report payload...");
                    frappe.call({
                        method: "frappe.desk.query_report.get",
                        args: {
                            report_name: this.current_report,
                            filters: this.active_filter_values || {}
                        },
                        callback: (rr) => {
                            const mm = rr.message;
                            if (mm && mm.columns && mm.result) {
                                this.render_table(mm.columns, mm.result);
                            } else {
                                console.error("Unexpected payload from query_report.get:", rr);
                                this.show_report_error("Report returned an unexpected payload. See console for details.");
                            }
                        },
                        error: (err) => {
                            console.error("Error fetching prepared report payload:", err);
                            this.show_report_error("Failed to fetch report results. See console for details.");
                        }
                    });
                    return;
                }

                // Fallback: unexpected payload shape
                console.warn("Unable to handle success response", r);
                this.show_report_error("Report returned an unexpected response. See console for details.");
            },
            error: (err) => {
                console.error("run_report error:", err);
                this.show_report_error("Failed to run report. See console for details.");
            }
        });
    }

    // Normalize columns & rows so render_table can handle multiple Frappe shapes
    normalize_columns_and_rows(columns, rows) {
        // If columns are an array of strings -> convert to objects and treat rows as arrays
        if (Array.isArray(columns) && columns.length && typeof columns[0] === "string") {
            const parsedCols = columns.map((colStr, idx) => {
                // typical string formats:
                // "Label:Type:Width", "fieldname:Link/Doctype:120", or "Field Label"
                const parts = colStr.split(":");
                const label = parts[0] || `Column ${idx + 1}`;
                // generate a safe fieldname for indexing rows (col0, col1, ...)
                return { label: label.trim(), fieldname: `col_${idx}` };
            });

            // if rows are array-of-arrays, convert to array-of-objects using col keys
            if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
                const objRows = rows.map(rowArr => {
                    const obj = {};
                    parsedCols.forEach((c, i) => obj[c.fieldname] = rowArr[i]);
                    return obj;
                });
                return { columns: parsedCols, rows: objRows };
            }

            // otherwise if rows are already objects, leave as-is but use parsed cols
            return { columns: parsedCols, rows: rows || [] };
        }

        // If columns are array-of-objects (common case)
        if (Array.isArray(columns) && columns.length && typeof columns[0] === "object") {
            // ensure each column has a fieldname and label
            const cols = columns.map((c, idx) => {
                return {
                    label: c.label || c.fieldname || c[0] || `Column ${idx + 1}`,
                    fieldname: c.fieldname || c.fieldname === "" ? c.fieldname : (c.fieldname || `col_${idx}`)
                };
            });

            // rows could be array-of-arrays or array-of-objects
            if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
                // map array rows to fieldname keys using column order
                const objRows = rows.map(rArr => {
                    const o = {};
                    cols.forEach((c, i) => o[c.fieldname] = rArr[i]);
                    return o;
                });
                return { columns: cols, rows: objRows };
            }

            return { columns: cols, rows: rows || [] };
        }

        // otherwise, return safe empty
        return { columns: [], rows: [] };
    }



    // ------------------------------------------
    // RENDER TABLE
    // ------------------------------------------
    render_table(columns, rows) {
        const thead = document.querySelector(".dynamic-report-table-head");
        const tbody = document.querySelector(".dynamic-report-table-body");

        if (!thead || !tbody) return;

        // header
        thead.innerHTML = `
            <tr>
                <th><input type="checkbox"/></th>
                ${columns.map(c => `<th>${c.label || c.fieldname}</th>`).join("")}
            </tr>
        `;

        // body
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><input type="checkbox"/></td>
                ${columns.map(c => `<td>${r[c.fieldname] ?? ""}</td>`).join("")}
            </tr>
        `).join("");
    }


    // -----------------------------------------------------------
    // CLEANUP + REAPPLY system (kept unchanged)
    // -----------------------------------------------------------
    createAssetManager(instance) {
        return {

            cleanup() {
                document.querySelectorAll('[data-reports="true"]').forEach(el => el.remove());

                const wrapper = document.querySelector(".reports-wrapper");
                if (wrapper) {
                    Array.from(wrapper.children).forEach(child => {
                        if (!child.classList.contains("content-page")) child.remove();
                    });
                }
            },

            reapply() {
                // You can re-run load_report() here if needed
            }
        };
    }
}

window.reportsPage = reportsPage;
frappe.reports_page_template = {
    body: `
        <div class="wrapper reports-wrapper">

            <div class="content-page" style="background-color:#F3F4F6;">
                <div class="container-fluid">

                    <div class="row mt-2">
                        <div class="leftcol">
                            <div class="card">

                                <div class="card-header d-flex justify-content-between align-items-center" style="border-bottom:none;">
                                    <h4 class="card-title mb-0" id="report-title">Report</h4>
                                </div>

                                <div class="card-body">

                                    <!-- Dynamic Filters Here -->
                                    <div class="row dynamic-report-filters"></div>

                                    <div class="table-responsive mt-3">
                                        <table class="table">
                                            <thead class="dynamic-report-table-head"></thead>
                                            <tbody class="dynamic-report-table-body"></tbody>
                                        </table>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <div class="rightcol col-lg-4"></div>

                    </div>

                </div>
            </div>

        </div>
    `
};**/
