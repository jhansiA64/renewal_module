
frappe.pages['performance-dashboar'].on_page_load = function (wrapper) {
    new PerformanceDashboard(wrapper);
}
frappe.router.on('change', () => {
    const route = frappe.get_route();
    if (frappe.PerformanceDashboard_page && route[0] !== "performance-dashboar") {
        location.reload(); // Reload the page
    }
});

class PerformanceDashboard {
    constructor(wrapper) {
        this.page = frappe.ui.make_app_page({
            parent: wrapper,
            title: 'Performance Dashboard',
            single_column: true
        });
        this.allOpportunities = [];
        this.activeStage = null;
        this.currentTableBody = null;
        this.totalFilteredRows = [];
        this.visibleRowCount = 0;
        this.selectedRowCount = 20;
        this.currentFilteredStageRows = [];

        this.load_css(() => {
            this.make();
        });
    }

    load_css(callback) {
        const faLink = document.createElement("link");
        faLink.rel = "stylesheet";
        faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
        document.head.appendChild(faLink);

        frappe.require([
            "/assets/renewal_module/css/employee-dashboard/style.bundle1.css",
        ], () => {
            if (callback) callback();
        });
    }

    make() {
        $(this.page.main).append(frappe.PerformanceDashboard_page.body);
        this.bindEvents();
        this.add_sales_person();
        this.toggleDateFields();
        this.multiselectDropdowns();
    }

    bindEvents() {
        const timeFilter = document.getElementById("time-filter");
        const periodicity = document.getElementById("periodicity");
        const fromDate = document.getElementById("from-date");
        const toDate = document.getElementById("to-date");
        const callIfReady = () => {
            const tf = timeFilter?.value;
            const from = fromDate?.value;
            const to = toDate?.value;
            if (tf === "custom") {
                // Only call when both from and to are filled
                if (from && to) {
                    this.loadData();
                }
            } else {
                this.loadData();
            }
        };
        // Time filter change
        if (timeFilter) {
            timeFilter.addEventListener("change", () => {
                this.toggleDateFields();
                callIfReady();
            });
        }
        // Periodicity change
        if (periodicity) {
            periodicity.addEventListener("change", () => callIfReady());
        }
        // From / To date changes
        if (fromDate && toDate) {
            fromDate.addEventListener("change", () => callIfReady());
            toDate.addEventListener("change", () => callIfReady());
        }
        // Setup date display inputs (same as before)
        const allRealInputs = [fromDate, toDate].filter(Boolean);
        const setupDisplayDateField = (displayId, realId, allInputs) => {
            const displayInput = document.getElementById(displayId);
            const realInput = document.getElementById(realId);
            const hideAll = () => allInputs.forEach(i => {
                i.style.opacity = "0";
                i.style.pointerEvents = "none";
            });

            displayInput.addEventListener("click", () => {
                hideAll();
                // Get bounding box of display field
                const rect = displayInput.getBoundingClientRect();
                const parentRect = displayInput.offsetParent?.getBoundingClientRect() || { top: 10, left: 0 };
                // Use absolute positioning relative to parent container, not viewport
                realInput.style.position = "absolute";
                realInput.style.left = `${rect.left - parentRect.left}px`;
                realInput.style.top = `${rect.bottom - parentRect.top + 4}px`;
                realInput.style.width = `${rect.width}px`;
                realInput.style.height = `${rect.height}px`;
                realInput.style.zIndex = "9999";
                realInput.style.opacity = "1";
                realInput.style.pointerEvents = "auto";
                // ✅ Show the calendar immediately
                setTimeout(() => {
                    realInput.focus();
                    if (realInput.showPicker) realInput.showPicker();
                }, 50);
            });
            realInput.addEventListener("change", () => {
                if (realInput.value) {
                    const [yyyy, mm, dd] = realInput.value.split("-");
                    displayInput.value = `${dd}-${mm}-${yyyy}`;
                }
                hideAll();
            });
            realInput.addEventListener("blur", () => setTimeout(hideAll, 100));
        };
        setupDisplayDateField("from-date-display", "from-date", allRealInputs);
        setupDisplayDateField("to-date-display", "to-date", allRealInputs);
    }

    toggleDateFields() {
        const timeFilter = document.getElementById("time-filter");
        const customDateFields = document.getElementById("custom-date-fields");
        const fromDate = document.getElementById("from-date");
        const toDate = document.getElementById("to-date");
        const fromDisplay = document.getElementById("from-date-display");
        const toDisplay = document.getElementById("to-date-display");

        if (!timeFilter || !customDateFields) return;
        if (timeFilter.value === "custom") {
            //Show custom date inputs
            customDateFields.classList.remove("hidden");
            // 🧹 Clear old dates when switching back to custom
            if (fromDate) fromDate.value = "";
            if (toDate) toDate.value = "";
            if (fromDisplay) fromDisplay.value = "";
            if (toDisplay) toDisplay.value = "";
        } else {
            //Hide custom date inputs & clear all date values
            customDateFields.classList.add("hidden");
            if (fromDate) fromDate.value = "";
            if (toDate) toDate.value = "";
            if (fromDisplay) fromDisplay.value = "";
            if (toDisplay) toDisplay.value = "";
        }
    }

    add_sales_person() {
        return new Promise(resolve => {
            const me = this;
            const $dropdown = $("#sales-person-dropdown");
            if (!$dropdown.length) {
                console.error("Sales Person dropdown not found");
                return resolve();
            }
            $dropdown.html(`<option value="">Sales Person</option>`);
            frappe.call({
                method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_sales_person",
                callback: function (r) {
                    if (!r.message) return resolve();
                    const list = r.message.sales_person_list || [];
                    const defaultSP = r.message.default_sales_person || "";
                    list.sort((a, b) => a.localeCompare(b));
                    list.forEach(sp => {
                        $dropdown.append(`<option value="${sp}">${sp}</option>`);
                    });
                    let toSelect =
                        (defaultSP && list.includes(defaultSP)) ? defaultSP :
                            (list.length === 1) ? list[0] : "";
                    $dropdown.val(toSelect);
                    me.loadData();
                    resolve();
                }
            });

            // $dropdown.off("change").on("change", function () {
            //     const sp = $(this).val() || "";
            //     me.loadData();
            // });
            $dropdown.off("change").on("change", function () {
                const sp = $(this).val() || "";
                const active = me.activeStage ? { ...me.activeStage } : null;
                me.loadData().then(() => {
                    if (active) {
                        try {
                            me.restoreActiveCard(active.stage, active.period);
                        } catch (err) {
                            console.error("[perf] restoreActiveCard immediate failed:", err);
                        }
                        [100, 300, 800].forEach(ms => {
                            setTimeout(() => {
                                try {
                                    me.restoreActiveCard(active.stage, active.period);
                                } catch (err) {
                                    console.error(`[perf] restoreActiveCard retry ${ms}ms failed:`, err);
                                }
                            }, ms);
                        });
                    }
                }).catch(err => {
                    console.error("[perf] loadData promise rejected (sales-person):", err);
                });
            });

        });
    }

    restoreActiveCard(stage, period) {
        const cards = document.querySelectorAll(".performance-period-card .stage-card");
        cards.forEach(cardEl => {
            const p = cardEl.closest(".performance-period-card").dataset.period;
            const s = cardEl.dataset.stage;
            if (p === period && s === stage) {
                cardEl.click();
                // After table loads, reapply dropdown filters
                setTimeout(() => {
                    if (this.currentFilteredStageRows) {
                        let filtered = this.applyDropdownFilters(this.currentFilteredStageRows);
                        this.renderOpportunitiesTable(filtered, true);
                        this.updateTableSummary(filtered);
                    }
                }, 200);
            }
        });
    }

    applyDropdownFilters(rows) {
        const getSelectedValues = (selector) => {
            const checkedItems = document.querySelectorAll(`${selector} .item.checked`);
            return Array.from(checkedItems).map(
                item => item.querySelector('.item-text')?.innerText.trim() || ""
            );
        };

        const selectedOppType = getSelectedValues("#opportunity-type");
        const selectedItemGroup = getSelectedValues("#item-group-filter");
        const selectedBrand = getSelectedValues("#brand-filter");

        return rows.filter(r => {

            if (selectedOppType.length && !selectedOppType.includes(r.opportunity_type)) {
                return false;
            }
            if (selectedItemGroup.length && !selectedItemGroup.includes(r.item_group)) {
                return false;
            }
            if (selectedBrand.length && !selectedBrand.includes(r.brand)) {
                return false;
            }
            return true;
        });
    }




    async loadData() {
        const salesPerson = document.getElementById("sales-person-dropdown")?.value || "";
        //console.log("salesperson", salesPerson);
        const timeFilter = document.getElementById("time-filter")?.value;
        const periodicity = document.getElementById("periodicity")?.value;
        const fromDate = document.getElementById("from-date")?.value;
        const toDate = document.getElementById("to-date")?.value;
        // Stop if custom but no dates
        if (timeFilter === "custom" && (!fromDate || !toDate)) {
            console.warn("Custom selected but missing date range");
            return;
        }
        // Get container
        const getContainer = () => {
            if (this.page?.main?.querySelector) return this.page.main.querySelector(".box6");
            if (this.page?.main?.find) return this.page.main.find(".box6")?.get(0);
            return document.querySelector(".box6");
        };

        const container = getContainer();
        if (!container) {
            console.error("loadData: .box6 container not found");
            return;
        }

        container.innerHTML = `<p class="m-3 text-muted">Loading data...</p>`;
        const apiArgs = {
            time_filter: timeFilter,
            periodicity: periodicity,
            from_date: fromDate || null,
            to_date: toDate || null,
            sales_person: salesPerson || ""
        };

        let openRes, committedRes, achievedRes;
        try {
            openRes = await frappe.call({
                method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_open_opp",
                args: apiArgs
            });
        } catch (e) {
            container.innerHTML = `<p class="text-danger m-3">Failed to load Open Opportunities.</p>`;
            return;
        }

        try {
            committedRes = await frappe.call({
                method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_committed_opp",
                args: apiArgs
            });
        } catch (e) {
            container.innerHTML = `<p class="text-danger m-3">Failed to load Committed Opportunities.</p>`;
            return;
        }

        try {
            achievedRes = await frappe.call({
                method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_won_opp",
                args: apiArgs
            });
        } catch (e) {
            container.innerHTML = `<p class="text-danger m-3">Failed to load Achieved Opportunities.</p>`;
            return;
        }

        // Convert results
        const openList = openRes?.message || [];
        const committedList = committedRes?.message || [];
        const achievedList = achievedRes?.message || [];
        console.log("Open data", openList);
        console.log("commited data", committedList);
        console.log("achieved data", achievedList);

        let finalMap = {};

        openList.forEach(p => {
            finalMap[p.period] = {
                period: p.period,
                open_amount: p.amount,
                open_count: p.count,
                row_open: p.row || []
            };
        });

        committedList.forEach(p => {
            finalMap[p.period] = {
                ...(finalMap[p.period] || { period: p.period }),
                committed_amount: p.amount,
                committed_count: p.count,
                row_committed: p.row || []
            };
        });

        achievedList.forEach(p => {
            finalMap[p.period] = {
                ...(finalMap[p.period] || { period: p.period }),
                achieved_amount: p.amount,
                achieved_count: p.count,
                row_achieved: p.row || []
            };
        });

        const finalPeriods = Object.values(finalMap);

        if (!finalPeriods.length) {
            container.innerHTML = `<p class="m-3 text-muted">No data found.</p>`;
            return;
        }

        const fmtINR = v => "₹" + (Number(v || 0)).toLocaleString("en-IN");

        this.allOpportunities = [];
        let html = "";

        finalPeriods.forEach((p, idx) => {
            const label = p.period || `Period ${idx + 1}`;
            const openAmount = fmtINR(p.open_amount);
            const committedAmount = fmtINR(p.committed_amount);
            const achievedAmount = fmtINR(p.achieved_amount);
            const openCount = p.open_count || 0;
            const committedCount = p.committed_count || 0;
            const achievedCount = p.achieved_count || 0;

            // Collect raw rows for table
            [...(p.row_open || []), ...(p.row_committed || []), ...(p.row_achieved || [])].forEach(r => {
                r._period_label = p.period;
                this.allOpportunities.push(r);
            });

            html += `
            <div class="widget-card1 performance-period-card" data-period="${label}">
                <div class="top-block1 mt-1 p-1">
                    <span>${label}</span>
                </div>
                <div class="bottom-blocks1 mb-1">

                    <div class="left-block1 stage-card" data-stage="Open" style="cursor:pointer;">
                        <h6 title="${openCount}">Open (${openCount})</h6>
                        <p class="yellow" title="${openAmount}">${openAmount}</p>
                    </div>

                    <div class="center-block1 stage-card" data-stage="Committed" style="cursor:pointer;">
                        <h6 title="${committedCount}">Committed (${committedCount})</h6>
                        <p class="blue" title="${committedAmount}">${committedAmount}</p>
                    </div>

                    <div class="right-block1 stage-card" data-stage="Achieved" style="cursor:pointer;">
                        <h6 title="${achievedCount}">Achieved (${achievedCount})</h6>
                        <p class="green" title="${achievedAmount}">${achievedAmount}</p>
                    </div>

                </div>
            </div>
        `;
        });
        this.closeAllDropdowns();
        // Render cards
        container.innerHTML = html;
        const tableWrapper = document.createElement("div");
        tableWrapper.id = "opportunity-table-container";
        tableWrapper.className = "row";
        tableWrapper.style.backgroundColor = "#F3F3F3";
        tableWrapper.style.borderRadius = "10px";
        tableWrapper.style.display = "none";

        tableWrapper.innerHTML = `
            <div class="col-12 d-flex flex-wrap justify-content-between align-items-center mt-3 mb-3">
                <!--<div id="table-title" style="font-weight:600; font-size:14px; margin-bottom:10px;"></div>-->
                <div class="d-flex align-items-center gap-3">
                    <div id="table-title" style="font-weight:600; font-size:14px;"></div>
                    <div id="table-summary"
                        style="font-size:12px; font-weight:600; color:#555;">
                    </div>
                </div>

                <div class="filter-section-responsive" id="filter-section">

                    <div class="custom-dropdown-wrapper">
                        <div class="select-btn" id="opportunity-type">
                            <span class="btn-text">Opportunity Type</span>
                            <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                        </div>
                        <div class="list-items">
                            <div class="search-box">
                                <input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type">
                            </div>
                            <ul class="items-list" id="itemsList-opportunity-type"></ul>
                        </div>
                    </div>

                    <div class="custom-dropdown-wrapper">
                        <div class="select-btn" id="item-group-filter">
                            <span class="btn-text">Item Group</span>
                            <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                        </div>
                        <div class="list-items">
                            <div class="search-box">
                                <input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter">
                            </div>
                            <ul class="items-list" id="itemsList-item-group-filter"></ul>
                        </div>
                    </div>

                    <div class="custom-dropdown-wrapper">
                        <div class="select-btn" id="brand-filter">
                            <span class="btn-text">Brand</span>
                            <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                        </div>
                        <div class="list-items">
                            <div class="search-box">
                                <input type="text" placeholder="Search..." class="search-input" data-target="brand-filter">
                            </div>
                            <ul class="items-list" id="itemsList-brand-filter"></ul>
                        </div>
                    </div>

                </div>
            </div>

            <div class="col-12">
                <div style="height:100%; max-height:300px; overflow-y:auto; overflow-x:auto; border:1px solid #dee2e6; border-radius:5px; background:white;">
                    <table id="opportunities-table" class="table table-bordered w-100 mb-0 m-0"></table>
                </div>

                <div class="list-paging-area level mb-2 mt-2" style="padding:5px;">
                    <div class="level-left">
                        <div class="btn-group">
                            <button class="btn btn-sm b1 mr-2" data-count="20">20</button>
                            <button class="btn btn-sm bl mr-2" data-count="100">100</button>
                            <button class="btn btn-sm b1 mr-2" data-count="500">500</button>
                            <button class="btn btn-sm b1" data-count="1500">1500</button>
                        </div>
                    </div>

                    <div class="level-right">
                        <button class="btn btn-sm" id="load-more-btn">Load More</button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(tableWrapper);
        this.multiselectDropdowns();

        const cards = Array.from(container.querySelectorAll(".performance-period-card .stage-card"));

        cards.forEach(cardEl => {
            cardEl.addEventListener("click", evt => {
                evt.stopPropagation();
                this.closeAllDropdowns();
                const liveWrapper = document.getElementById("opportunity-table-container");
                const periodCard = cardEl.closest(".performance-period-card");
                const period = periodCard.dataset.period;
                const stage = cardEl.dataset.stage;

                // Toggle off
                if (this.activeStage &&
                    this.activeStage.stage === stage &&
                    this.activeStage.period === period) {

                    this.activeStage = null;
                    liveWrapper.style.display = "none";
                    this.clearActivePerformanceStyles();
                    this.clearAllDropdownFilters();
                    return;
                }
                this.clearAllDropdownFilters();
                // RE-FIND ALL CARDS for correct insert
                const allCards = Array.from(container.querySelectorAll(".performance-period-card"));
                const index = allCards.indexOf(periodCard);
                const rowIndex = Math.floor(index / 4);
                const insertPos = (rowIndex + 1) * 4;
                const afterCard = allCards[insertPos - 1];

                if (liveWrapper.parentNode) liveWrapper.parentNode.removeChild(liveWrapper);
                if (afterCard && afterCard.parentNode)
                    afterCard.parentNode.insertBefore(liveWrapper, afterCard.nextSibling);
                else
                    container.appendChild(liveWrapper);

                liveWrapper.style.display = "block";
                document.getElementById("table-title").textContent = `${stage} – ${period}`;

                // Update active stage
                this.activeStage = { stage, period };

                // Filter rows by stage
                let rows = [];
                if (stage === "Open") rows = finalMap[period].row_open || [];
                if (stage === "Committed") rows = finalMap[period].row_committed || [];
                if (stage === "Achieved") rows = finalMap[period].row_achieved || [];

                // After you get rows for the stage:
                if (this.selectedSalesPerson) {
                    rows = rows.filter(row => row.sales_person === this.selectedSalesPerson);
                }

                this.currentFilteredStageRows = rows;
                const filtered = this.applyDropdownFilters(rows);
                this.renderOpportunitiesTable(filtered, true);
                //this.renderOpportunitiesTable(rows, true);
                this.updateTableSummary(rows);
                this.clearActivePerformanceStyles();
                this.highlightActivePerformanceCard(stage, period);
            });
        });
    }


    clearAllDropdownFilters() {
        // Clear UI checkmarks
        document.querySelectorAll(".items-list .item.checked").forEach(item => {
            item.classList.remove("checked");
        });
        // Reset button label text
        document.querySelectorAll(".select-btn .btn-text").forEach(btn => {
            btn.textContent = btn.dataset.defaultLabel || btn.textContent;
        });
        // Reset internal selected lists for ALL dropdowns
        if (this.selectedFilters) {
            Object.keys(this.selectedFilters).forEach(key => {
                this.selectedFilters[key].clear();
            });
        }
        // Reset custom arrays used by filter logic
        this.currentFilterBrands = [];
        this.currentFilterItemGroups = [];
        this.currentFilterOppTypes = [];
    }

    updateTableSummary(rows) {
        let totalRows = rows.length;
        let totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        const fmtINR = v => "₹" + (Number(v || 0)).toLocaleString("en-IN");
        const summaryBox = document.getElementById("table-summary");
        if (!summaryBox) return;
        summaryBox.textContent = `(Count: ${totalRows}  |  Total Amount: ${fmtINR(totalAmount)})`;
    }


    closeAllDropdowns() {
        // remove the 'open' class from any open dropdowns
        document.querySelectorAll('.select-btn.open').forEach(btn => {
            btn.classList.remove('open');
        });
    }


    highlightActivePerformanceCard(stage, periodLabel = null) {
        // remove previous
        this.clearActivePerformanceStyles();
        // find matching elements
        document.querySelectorAll(".performance-period-card").forEach(card => {
            const cardPeriod = card.getAttribute("data-period");
            const nodes = Array.from(card.querySelectorAll(".stage-card"));
            nodes.forEach(node => {
                const nodeStage = node.getAttribute("data-stage");
                if (nodeStage === stage && (!periodLabel || cardPeriod === periodLabel)) {
                    node.classList.add("active-stage-card");
                }
            });
        });
    }

    clearActivePerformanceStyles() {
        document.querySelectorAll(".performance-period-card .stage-card").forEach(node => {
            node.classList.remove("active-stage-card");
        });
    }

    renderOpportunitiesTable(data, show = true) {
        this.allFilteredOpportunities = Array.isArray(data) ? data : [];
        const tableWrapper = document.getElementById("opportunity-table-container");
        if (!tableWrapper) return;
        tableWrapper.style.display = show ? "block" : "none";
        const table = document.getElementById("opportunities-table");
        if (!table) return;
        let thead = table.querySelector("thead");
        if (!thead) {
            thead = document.createElement("thead");
            table.insertBefore(thead, table.firstChild);
        }
        let tbody = table.querySelector("tbody");
        if (!tbody) {
            tbody = document.createElement("tbody");
            table.appendChild(tbody);
        }
        tbody.innerHTML = "";
        thead.innerHTML = "";
        // No data case
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="50" class="text-center">No records found</td></tr>`;
            this.currentTableBody = tbody;
            this.totalFilteredRows = [];
            this.visibleRowCount = 0;
            this.updateTableSummary([]);
            document.getElementById("load-more-btn").style.display = "none";
            return;
        }
        // Build headers
        const keys = Object.keys(data[0]).filter(k => k !== "item_row" && k !== "_period_label");
        const headerRow = document.createElement("tr");
        // Serial number (S.No)
        const snTh = document.createElement("th");
        snTh.textContent = "S.No";
        snTh.style.minWidth = "40px";
        snTh.style.maxWidth = "60px";
        snTh.style.textAlign = "center";
        snTh.style.position = "sticky";
        snTh.style.top = "0";
        snTh.style.zIndex = "5";
        snTh.style.backgroundColor = "#f8f9fa";
        headerRow.appendChild(snTh);

        keys.forEach(key => {
            const th = document.createElement("th");
            th.textContent = this.prettyLabel(key);
            th.style.position = "sticky";
            th.style.top = "0";
            th.style.zIndex = "5";
            th.style.backgroundColor = "#f8f9fa";
            th.style.minWidth = ["name", "item_code", "committed_date"].includes(key) ? "150px" : "80px";
            th.style.maxWidth = ["name", "item_code", "committed_date"].includes(key) ? "300px" : "160px";
            th.style.overflow = "hidden";
            th.style.textOverflow = "ellipsis";
            th.style.whiteSpace = "nowrap";
            th.title = this.prettyLabel(key);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // Build body rows
        data.forEach((item, index) => {
            const row = document.createElement("tr");
            const snTd = document.createElement("td");
            item._item_row = item.item_row || item.item_code || "";
            snTd.textContent = index + 1;
            snTd.style.textAlign = "center";
            snTd.style.fontWeight = "600";
            row.appendChild(snTd);

            keys.forEach(key => {
                const td = document.createElement("td");
                let value = item[key] ?? "";
                if (key === "committed_date") {
                    let dateText = value ? frappe.datetime.str_to_user(value) : "";
                    let isSystemManager = frappe.user_roles.includes("System Manager");
                    let editIcon = isSystemManager ? `
                        <i class="fa-solid fa-pen-to-square edit-committed"
                            data-name="${item.name}"
                            data-date="${value || ''}"
                            data-item-row="${item._item_row || ''}"
                            style="cursor:pointer; color:#28a745; margin-left:6px;">
                        </i>
                    ` : "";
                    td.innerHTML = `
                        <div style="display:flex; align-items:center; gap:10px; min-width:120px;">
                            <span style="min-width:90px; display:inline-block;">
                                ${dateText || ""}
                            </span>
                            <i class="fa-solid fa-eye view-committed"
                                data-name="${item.name}"
                                data-item-row="${item._item_row || ''}"
                                style="cursor:pointer; color:#007bff;">
                            </i>
                            ${editIcon}
                        </div>
                    `;
                }

                // Numeric Money Formatting
                else if (
                    ["amount", "buying_amount", "gross_profit", "net_profit", "margin", "mdf", "support", "orc"]
                        .includes(key) && !isNaN(Number(value))
                ) {
                    td.textContent = `₹ ${this.formatIndianNumber(Number(value))}`;
                    td.style.textAlign = "right";
                }
                // Name → clickable link
                else if (key === "name") {
                    const link = document.createElement("a");
                    link.href = `/app/opportunity/${value}`;
                    link.textContent = value;
                    link.target = "_blank";
                    link.style.color = "#007bff";
                    td.appendChild(link);
                }
                // Normal text
                else {
                    td.textContent = value;
                }
                td.style.minWidth = ["name", "item_code", "committed_date"].includes(key) ? "150px" : "80px";
                td.style.maxWidth = ["name", "item_code", "committed_date"].includes(key) ? "300px" : "160px";
                td.style.overflow = "hidden";
                td.style.textOverflow = "ellipsis";
                td.style.whiteSpace = "nowrap";
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });

        // Store table rows for paging
        this.currentTableBody = tbody;
        this.totalFilteredRows = Array.from(tbody.querySelectorAll("tr"));
        // Show first 20 rows by default
        this.selectedRowCount = 20;
        this.visibleRowCount = 20;
        this.showRows(this.selectedRowCount);
        // Update summary box
        this.updateTableSummary(this.allFilteredOpportunities);
        // Bind paging
        const bottomButtons = document.querySelectorAll(".list-paging-area .btn-group .btn");
        bottomButtons.forEach(btn => btn.classList.remove("bl"));
        bottomButtons.forEach(btn => {
            if (Number(btn.dataset.count) === 20) btn.classList.add("bl");
            btn.onclick = () => {
                const count = Number(btn.dataset.count);
                bottomButtons.forEach(b => b.classList.remove("bl"));
                btn.classList.add("bl");
                this.showRows(count);
            };
        });
        // Load More
        const loadMoreBtn = document.getElementById("load-more-btn");
        if (loadMoreBtn) {
            loadMoreBtn.onclick = () => this.loadMoreRows();
            loadMoreBtn.style.display =
                (this.totalFilteredRows.length > this.visibleRowCount) ? "inline-block" : "none";
        }
        // Attach popup handlers
        this.attachCommittedPopupHandlers();
    }

    attachCommittedPopupHandlers() {
        // VIEW POPUP
        document.querySelectorAll(".view-committed").forEach(icon => {
            icon.addEventListener("click", () => {
                const name = icon.dataset.name;
                const opp_item_name = icon.dataset.itemRow || "";
                frappe.call({
                    method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_committed_child_row",
                    args: { name: name, opp_item_name: opp_item_name },
                    callback: (r) => {
                        const rows = r.message || [];
                        if (!rows.length) {
                            frappe.msgprint("No committed history found.");
                            return;
                        }
                        // Build custom HTML for modal
                        let html = `
                            <div style="max-height: 400px; overflow-y: auto;">
                                <table class="table table-bordered" style="width: 100%;">
                                    <thead style="background-color:#f3f3f3;">
                                        <tr>
                                            <th style="width: 100px;">Date</th>
                                            <th>Reason</th>
                                        </tr>
                                    </thead>
                                <tbody>
                        `;
                        rows.forEach(r => {
                            html += `
                                <tr>
                                    <td>${r.committed_date ? frappe.datetime.str_to_user(r.committed_date) : " "}</td>
                                    <td>${r.reason || " "}</td>
                                </tr>
                            `;
                        });

                        html += `
                                    </tbody>
                                </table>
                            </div>
                        `;
                        // Create Modern Dialog
                        let d = new frappe.ui.Dialog({
                            title: "Committed Date History",
                            size: "large",
                            primary_action_label: "Close",
                            primary_action: () => d.hide()
                        });
                        d.$body.html(html);
                        d.show();
                    }
                });
            });
        });


        // EDIT POPUP
        document.querySelectorAll(".edit-committed").forEach(icon => {
            icon.addEventListener("click", () => {
                const name = icon.dataset.name;
                const opp_item_name = icon.dataset.itemRow || "";
                frappe.call({
                    method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_last_committed_row",
                    args: {
                        name: name,
                        opp_item_name: opp_item_name
                    },
                    callback: (r) => {
                        let row = r.message || {};   // empty object if no data
                        let d = new frappe.ui.Dialog({
                            title: "Edit Committed Details",
                            fields: [
                                {
                                    label: "Committed Date",
                                    fieldname: "committed_date",
                                    fieldtype: "Date",
                                    default: row.committed_date || ""
                                },
                                {
                                    label: "Reason",
                                    fieldname: "reason",
                                    fieldtype: "Small Text",
                                    default: row.reason || ""
                                },
                                {
                                    label: "Opp Item Name",
                                    fieldname: "opp_item_name",
                                    fieldtype: "Data",
                                    read_only: 1,
                                    default: opp_item_name
                                }
                            ],
                            primary_action_label: "Save",
                            primary_action: (values) => {
                                frappe.call({
                                    method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.save_committed_child_row",
                                    args: {
                                        name: name,
                                        committed_date: values.committed_date,
                                        reason: values.reason,
                                        opp_item_name: opp_item_name
                                    },
                                    callback: () => {
                                        frappe.msgprint("Committed details saved successfully.");
                                        const targetRow = document.querySelector(
                                            `.edit-committed[data-name="${name}"][data-item-row="${opp_item_name}"]`
                                        );

                                        if (targetRow) {
                                            const newDate = frappe.datetime.str_to_user(values.committed_date);

                                            // Update visible date text
                                            const dateSpan = targetRow.parentElement.querySelector("span");
                                            if (dateSpan) dateSpan.textContent = newDate;

                                            // Update icon dataset
                                            targetRow.dataset.date = values.committed_date;

                                            // Update local table data array
                                            const rowObj = this.allFilteredOpportunities.find(
                                                r => r.name === name && r._item_row === opp_item_name
                                            );
                                            if (rowObj) {
                                                rowObj.committed_date = values.committed_date;
                                            }
                                        }
                                        d.hide();
                                    }
                                });

                            }
                        });
                        d.show();
                    }
                });
            });
        });
    }

    resetPagingButtons() {
        const buttons = document.querySelectorAll(".list-paging-area .btn-group .btn");
        buttons.forEach(btn => btn.classList.remove("bl"));
        // Default 20
        buttons.forEach(btn => {
            if (Number(btn.getAttribute("data-count")) === 20) {
                btn.classList.add("bl");
            }
        });
        this.selectedRowCount = 20;
        this.visibleRowCount = 20;
    }


    showRows(count = 20, button = null) {
        const loadMoreBtn = document.getElementById("load-more-btn");
        if (loadMoreBtn) loadMoreBtn.classList.remove("bl");
        if (button) {
            document.querySelectorAll(".list-paging-area .btn-group .btn")
                .forEach(btn => btn.classList.remove("bl"));
            button.classList.add("bl");
            this.selectedRowCount = count;
        } else {
            this.selectedRowCount = count;
        }
        // If there are no rows, nothing to show
        if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) {
            this.visibleRowCount = 0;
            if (loadMoreBtn) loadMoreBtn.style.display = "none";
            return;
        }
        this.visibleRowCount = Math.min(Number(count) || 0, this.totalFilteredRows.length);
        if (!this.visibleRowCount) {
            this.visibleRowCount = Math.min(20, this.totalFilteredRows.length);
        }
        this.totalFilteredRows.forEach(row => row.style.display = "none");
        this.totalFilteredRows.slice(0, this.visibleRowCount).forEach(row => row.style.display = "");
        if (loadMoreBtn) {
            if (this.totalFilteredRows.length > this.visibleRowCount) {
                loadMoreBtn.style.display = "inline-block";
            } else {
                loadMoreBtn.style.display = "none";
            }
        }
    }


    loadMoreRows() {
        if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) return;
        // Remove highlight from number buttons
        document.querySelectorAll(".list-paging-area .btn-group .btn")
            .forEach(btn => btn.classList.remove("bl"));
        // Highlight LOAD MORE button
        document.getElementById("load-more-btn").classList.add("bl");
        const nextCount = 100;
        const rowsToShow = this.totalFilteredRows.slice(
            this.visibleRowCount,
            this.visibleRowCount + nextCount
        );
        rowsToShow.forEach(row => row.style.display = "");
        this.visibleRowCount += rowsToShow.length;
        // Hide Load More if no more rows left
        const loadMoreBtn = document.getElementById("load-more-btn");
        if (loadMoreBtn) {
            if (this.visibleRowCount >= this.totalFilteredRows.length) {
                loadMoreBtn.style.display = "none";
            }
        }

    }

    formatIndianNumber(number) {
        const num = Number(number);
        if (isNaN(num)) return number;
        return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }

    prettyLabel(key) {
        return key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    }

    filterTableByStage(stage) {
        if (!Array.isArray(this.allOpportunities)) {
            console.error("allOpportunities is not an array.");
            return;
        }
        const filtered = this.allOpportunities.filter(opp => opp.sales_stage === stage);
        this.renderOpportunitiesTable(filtered, true);
        this.highlightActivePerformanceCard(stage);
    }

    filterTableByItemGroupAndBrand(itemGroups = [], brands = [], oppTypes = []) {
        // If card has NO rows → always show EMPTY
        if (!this.currentFilteredStageRows || this.currentFilteredStageRows.length === 0) {
            console.log("No rows for this card — filters must also return zero.");
            this.renderOpportunitiesTable([], true);
            this.resetPagingButtons();
            return;
        }
        const baseRows = this.currentFilteredStageRows;
        const filtered = baseRows.filter(opp => {
            const matchGroup = itemGroups.length ? itemGroups.includes(opp.item_group) : true;
            const matchBrand = brands.length ? brands.includes(opp.brand) : true;
            const matchOppType = oppTypes.length ? oppTypes.includes(opp.opportunity_type) : true;
            return matchGroup && matchBrand && matchOppType;
        });
        this.renderOpportunitiesTable(filtered, true);
        this.updateTableSummary(filtered);
        this.resetPagingButtons();
    }


    multiselectDropdowns() {
        const setupCustomDropdown = ({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) => {
            const selectBtn = document.getElementById(targetId);
            const btnText = selectBtn?.querySelector(".btn-text");
            const itemList = document.getElementById(`itemsList-${targetId}`);
            const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
            this.selectedFilters = this.selectedFilters || {};
            this.selectedFilters[targetId] = new Set();
            let selectedItems = this.selectedFilters[targetId];

            if (!selectBtn || !btnText || !itemList || !searchBox) {
                return;
            }

            const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
            btnText.dataset.defaultLabel = defaultLabel;
            btnText.textContent = defaultLabel;

            selectBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".select-btn").forEach(btn => {
                    if (btn !== selectBtn) btn.classList.remove("open");
                });
                selectBtn.classList.toggle("open");
            });

            document.addEventListener("click", (e) => {
                const insideDropdown = selectBtn.closest(".custom-dropdown-wrapper").contains(e.target);
                const clickedCard = e.target.closest(".stage-card") || e.target.closest(".performance-period-card");
                if (!insideDropdown || clickedCard) {
                    selectBtn.classList.remove("open");
                }
            });

            searchBox.addEventListener("keyup", function () {
                const searchTerm = this.value.toLowerCase();
                itemList.querySelectorAll(".item").forEach(item => {
                    const text = item.innerText.toLowerCase();
                    item.style.display = text.includes(searchTerm) ? "flex" : "none";
                });
            });

            function renderItems(list) {
                itemList.innerHTML = "";
                list.forEach(item => {
                    const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
                    const li = document.createElement("li");
                    li.className = "item";
                    li.setAttribute("data-value", value);
                    li.setAttribute("title", value);
                    li.innerHTML = `<span class="item-text">${value}</span>`;
                    itemList.appendChild(li);
                });
                bindItemEvents();
            }

            function bindItemEvents() {
                itemList.querySelectorAll(".item").forEach(item => {
                    item.addEventListener("click", function () {
                        const value = this.getAttribute("data-value");
                        if (selectedItems.has(value)) {
                            selectedItems.delete(value);
                            this.classList.remove("checked");
                        } else {
                            selectedItems.add(value);
                            this.classList.add("checked");
                        }
                        const selectedArray = Array.from(selectedItems);
                        btnText.textContent = selectedArray.length > 0 ? `${selectedArray.length} selected` : btnText.dataset.defaultLabel;
                        if (typeof onSelectionChange === "function") {
                            onSelectionChange(selectedArray);
                        }
                    });
                });
            }

            if (options.length) {
                renderItems(options);
            } else {
                // fetch from server
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype,
                        fields: [labelField],
                        order_by: labelField + " asc",
                        limit_page_length: 999
                    },
                    callback: function (r) {
                        if (r.message) {
                            const items = (r.message || []).map(it => ({ name: it[labelField] || it.name }));
                            renderItems(items);
                        }
                    }
                });
            }
        };

        // Opportunity Type
        frappe.model.with_doctype("Opportunity Item", () => {
            const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
            const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
            setupCustomDropdown({
                doctype: "Opportunity Type",
                targetId: "opportunity-type",
                options: oppTypes,
                onSelectionChange: (selectedOppTypes) => {
                    const itemGroups = this.getSelectedValues("item-group-filter");
                    const brands = this.getSelectedValues("brand-filter");
                    this.filterTableByItemGroupAndBrand(itemGroups, brands, selectedOppTypes);
                }
            });
        });

        // Brand
        setupCustomDropdown({
            doctype: "Brand",
            targetId: "brand-filter",
            options: [],
            onSelectionChange: (selectedBrands) => {
                const itemGroups = this.getSelectedValues("item-group-filter");
                const oppTypes = this.getSelectedValues("opportunity-type");
                this.filterTableByItemGroupAndBrand(itemGroups, selectedBrands, oppTypes);
            }
        });

        // Item Group
        setupCustomDropdown({
            doctype: "Item Group",
            targetId: "item-group-filter",
            onSelectionChange: (selectedGroups) => {
                // custom brand population logic from your previous code
                const brandList = document.getElementById("itemsList-brand-filter");
                const brandBtnText = document.querySelector("#brand-filter .btn-text");
                if (brandList) brandList.innerHTML = '';
                if (brandBtnText) brandBtnText.textContent = "Brand";
                const updateBrandList = (brands) => {
                    const uniqueBrands = [...new Set(brands.filter(Boolean))];
                    uniqueBrands.sort();
                    uniqueBrands.forEach(brand => {
                        const li = document.createElement("li");
                        li.className = "item";
                        li.setAttribute("data-value", brand);
                        li.setAttribute("title", brand);
                        li.innerHTML = `<span class="item-text">${brand}</span>`;
                        if (brandList) brandList.appendChild(li);
                    });

                    if (brandList) {
                        brandList.querySelectorAll(".item").forEach(item => {
                            item.addEventListener("click", (e) => {
                                const el = e.currentTarget;
                                el.classList.toggle("checked");
                                const checkedItems = brandList.querySelectorAll(".item.checked");
                                const labels = Array.from(checkedItems).map(i => i.innerText.trim());
                                if (brandBtnText) {
                                    brandBtnText.textContent = labels.length > 0
                                        ? (labels.join(", ").length > 15 ? labels.join(", ").substring(0, 15) + "..." : labels.join(", "))
                                        : "Brand";
                                }
                                const brands = labels;
                                const oppTypes = this.getSelectedValues("opportunity-type");
                                const itemGroups = selectedGroups;
                                this.filterTableByItemGroupAndBrand(itemGroups, brands, oppTypes);
                            });
                        });
                    }
                };

                if (!selectedGroups.length) {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item",
                            fields: ["brand"],
                            limit_page_length: 999
                        },
                        callback: (res) => {
                            const items = res.message || [];
                            const brands = items.map(i => i.brand);
                            updateBrandList(brands);
                        }
                    });
                } else {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item",
                            fields: ["brand", "item_group"],
                            filters: [["item_group", "in", selectedGroups]],
                            limit_page_length: 999
                        },
                        callback: (res) => {
                            const items = res.message || [];
                            const brands = items.map(i => i.brand);
                            updateBrandList(brands);
                        }
                    });
                }
                const brands = this.getSelectedValues("brand-filter");
                const oppTypes = this.getSelectedValues("opportunity-type");
                this.filterTableByItemGroupAndBrand(selectedGroups, brands, oppTypes);
            }
        });
    }

    getSelectedValues(targetId) {
        const list = document.querySelectorAll(`#itemsList-${targetId} .item.checked`);
        return Array.from(list).map(item => item.getAttribute("data-value"));
    }

}

frappe.PerformanceDashboard_page = {
    body: `
        <div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
                <div class="title5">
                    
                </div>
                <div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">

                    <select id="time-filter" class="form-select form-select-sm me-2" style="width:130px;">
                        <option value="last 6 months">Last 6 Months</option>
                        <option value="last quarter">Last Quarter</option>
                        <option value="last month">Last Month</option>
                        <option value="last week">Last Week</option>
                        <option value="this week">This Week</option>
                        <option value="this month" selected>This Month</option>
                        <option value="this quarter">This Quarter</option>
                        <option value="this year">This Year</option>
                        <option value="next week">Next Week</option>
                        <option value="next month">Next Month</option>
                        <option value="next quarter">Next Quarter</option>
                        <option value="next 6 months">Next 6 Months</option>
                        <option value="custom">Custom</option>
                    </select>

                    <div id="custom-date-fields" class="d-flex flex-wrap align-items-center ms-2 hidden">
                        <input type="text" id="from-date-display" class="form-control form-control-sm me-2"
                            placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
                        <input type="text" id="to-date-display" class="form-control form-control-sm"
                            placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

                        <input type="date" id="from-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
                        <input type="date" id="to-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
                    </div>

                    <select id="periodicity" class="form-select form-select-sm me-2" style="width:130px;">
                        <option value="weekly" selected>Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                    </select>

                    <select class="form-select form-select-sm me-2" id="sales-person-dropdown" style="width:130px;">
						<option value="">Sales Person</option>
					</select>
                </div>
            </div>	
        </div>

        <div class="row mt-2 d-flex align-items-stretch" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="col-12 d-flex flex-column">
                <div class="box6 m-2">
                    
                </div>
            </div>
        </div>

    `
};

/**renderOpportunitiesTable(data, show = true) {
    this.allFilteredOpportunities = Array.isArray(data) ? data : [];

    const tableWrapper = document.getElementById("opportunity-table-container");
    if (!tableWrapper) {
        console.warn("opportunity-table-container not found in DOM.");
        return;
    }
    tableWrapper.style.display = show ? "block" : "none";

    const table = document.getElementById("opportunities-table");
    if (!table) {
        console.warn("opportunities-table not found in DOM.");
        return;
    }

    // Ensure table has thead and tbody
    let thead = table.querySelector("thead");
    if (!thead) {
        thead = document.createElement("thead");
        table.insertBefore(thead, table.firstChild);
    }
    let tbody = table.querySelector("tbody");
    if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
    }

    tbody.innerHTML = "";
    thead.innerHTML = "";

    if (!data || data.length === 0) {
        thead.innerHTML = "";
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center">No records found</td></tr>`;

        // reset internal state
        this.currentTableBody = tbody;
        this.totalFilteredRows = Array.from(tbody.querySelectorAll("tr"));
        this.selectedRowCount = 20;
        this.visibleRowCount = 0;

        // update summary & load-more visibility
        this.updateTableSummary(this.allFilteredOpportunities || []);
        const loadMoreBtnEmpty = document.getElementById("load-more-btn");
        if (loadMoreBtnEmpty) loadMoreBtnEmpty.style.display = "none";

        return;
    }

    // Build header from keys of first object (skip item_row as earlier)
    const keys = Object.keys(data[0]).filter(k => k !== "item_row" && k !== "_period_label");
    const headerRow = document.createElement("tr");

    const snTh = document.createElement("th");
    snTh.textContent = "S.No";
    snTh.style.minWidth = "40px";
    snTh.style.maxWidth = "60px";
    snTh.style.textAlign = "center";
    snTh.style.position = "sticky";
    snTh.style.top = "0";
    snTh.style.zIndex = "3";
    snTh.style.backgroundColor = "#f8f9fa";
    headerRow.appendChild(snTh);

    keys.forEach(key => {
        const th = document.createElement("th");
        th.textContent = this.prettyLabel(key);
        th.style.position = "sticky";
        th.style.top = "0";
        th.style.backgroundColor = "#f8f9fa";
        th.style.minWidth = ["name", "item_code"].includes(key) ? "150px" : "80px";
        th.style.maxWidth = ["name", "item_code"].includes(key) ? "300px" : "160px";
        th.style.overflow = "hidden";
        th.style.textOverflow = "ellipsis";
        th.style.whiteSpace = "nowrap";
        th.title = this.prettyLabel(key);
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Populate rows
    data.forEach((item, index) => {
        const row = document.createElement("tr");
        const snTd = document.createElement("td");
        snTd.textContent = index + 1;
        snTd.style.textAlign = "center";
        snTd.style.fontWeight = "600";
        row.appendChild(snTd);

        keys.forEach(key => {
            const td = document.createElement("td");
            let value = item[key] !== null && item[key] !== undefined ? item[key] : "";

            if (["amount", "buying_amount", "gross_profit", "net_profit", "margin", "mdf", "support", "orc"].includes(key) && !isNaN(Number(value))) {
                const formatted = this.formatIndianNumber(Number(value));
                td.textContent = `₹ ${formatted}`;
                td.title = formatted;
                td.style.textAlign = "right";
            } else if (key === "name") {
                const link = document.createElement("a");
                link.href = `/app/opportunity/${value}`;
                link.textContent = value;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.style.textDecoration = "none";
                link.style.color = "#007bff";
                link.title = value;
                td.appendChild(link);
            } else {
                td.textContent = value;
                td.title = value;
            }

            td.style.minWidth = ["name", "item_code"].includes(key) ? "150px" : "80px";
            td.style.maxWidth = ["name", "item_code"].includes(key) ? "300px" : "160px";
            td.style.overflow = "hidden";
            td.style.textOverflow = "ellipsis";
            td.style.whiteSpace = "nowrap";

            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    // set current table/tracking variables AFTER rows appended
    this.currentTableBody = tbody;
    this.totalFilteredRows = Array.from(tbody.querySelectorAll("tr"));
    this.selectedRowCount = 20;
    this.visibleRowCount = 20;
    this.showRows(this.selectedRowCount);
    // default selectedRowCount if not set
    //if (!this.selectedRowCount) this.selectedRowCount = 20;
    // If visibleRowCount is 0 (first render), set it to the smaller of selectedRowCount or total rows
    if (!this.visibleRowCount || this.visibleRowCount < 1) {
        this.visibleRowCount = Math.min(this.selectedRowCount, this.totalFilteredRows.length);
    }

    // show first slice
    this.totalFilteredRows.forEach(row => row.style.display = "none");
    this.totalFilteredRows.slice(0, this.visibleRowCount).forEach(row => row.style.display = "");

    // Update summary now that table is rendered
    this.updateTableSummary(this.allFilteredOpportunities || []);

    // BIND bottom pagination buttons
    const bottomButtons = document.querySelectorAll(".list-paging-area .btn-group .btn");
    const defaultCount = 20;
    bottomButtons.forEach(btn => btn.classList.remove("bl"));
    bottomButtons.forEach(btn => {
        if (Number(btn.getAttribute("data-count")) === defaultCount) {
            btn.classList.add("bl");
        }
        btn.onclick = () => {
            const count = Number(btn.getAttribute("data-count"));
            bottomButtons.forEach(b => b.classList.remove("bl"));
            btn.classList.add("bl");
            // when user chooses a specific count, reset visibleRowCount to that count
            this.selectedRowCount = count;
            this.visibleRowCount = Math.min(count, this.totalFilteredRows.length);
            this.totalFilteredRows.forEach(row => row.style.display = "none");
            this.totalFilteredRows.slice(0, this.visibleRowCount).forEach(row => row.style.display = "");
            // update load more visibility
            const loadMoreBtnNow = document.getElementById("load-more-btn");
            if (loadMoreBtnNow) {
                loadMoreBtnNow.style.display = (this.totalFilteredRows.length > this.visibleRowCount) ? "inline-block" : "none";
            }
        };
    });

    // Bind Load More button AFTER we have totalFilteredRows & visibleRowCount set
    const loadMoreBtn = document.getElementById("load-more-btn");
    if (loadMoreBtn) {
        loadMoreBtn.onclick = () => this.loadMoreRows();
        loadMoreBtn.style.display = (this.totalFilteredRows.length > this.visibleRowCount) ? "inline-block" : "none";
    }
}**/
/**async loadData() {
    const timeFilter = document.getElementById("time-filter")?.value;
    const periodicity = document.getElementById("periodicity")?.value;
    const fromDate = document.getElementById("from-date")?.value;
    const toDate = document.getElementById("to-date")?.value;
    //console.log("filters:", { timeFilter, periodicity, fromDate, toDate });
    // Stop if custom but no dates
    if (timeFilter === "custom" && (!fromDate || !toDate)) {
        console.log("Custom date selected but missing dates — aborting loadData()");
        return;
    }
    // Get .box6 container
    const getContainer = () => {
        if (this.page?.main?.querySelector) return this.page.main.querySelector(".box6");
        if (this.page?.main?.find) return this.page.main.find(".box6")?.get(0);
        return document.querySelector(".box6");
    };

    const container = getContainer();
    if (!container) {
        console.error("loadData: .box6 container not found");
        return;
    }

    container.innerHTML = `<p class="m-3 text-muted">Loading data...</p>`;
    //console.log("loadData: container found, showing loader...");

    let resp;
    try {
        resp = await frappe.call({
            method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_opp_data",
            args: {
                time_filter: timeFilter,
                periodicity: periodicity,
                from_date: fromDate || null,
                to_date: toDate || null
            }
        });
    } catch (e) {
        console.error("loadData: API call failed", e);
        container.innerHTML = `<p class="text-danger m-3">Failed to load data.</p>`;
        return;
    }

    const periods = resp?.message || [];
    console.log("data", periods);
    console.log("loadData: received periods:", periods.length);

    if (!periods.length) {
        container.innerHTML = `<p class="m-3 text-muted">No data found for this filter</p>`;
        return;
    }

    const fmtINR = v => "₹" + (Number(v || 0)).toLocaleString("en-IN");

    this.allOpportunities = [];

    let html = "";
    periods.forEach((p, idx) => {
        const label = p.period || `Period ${idx + 1}`;
        const open = fmtINR(p.closed_lost);
        const proposal = fmtINR(p.proposal);
        const won = fmtINR(p.closed_won);


        // Collect raw rows
        (p.row || []).forEach(r => {
            r._period_label = p.period;
            this.allOpportunities.push(r);
        });

        html += `
            <div class="widget-card1 performance-period-card" data-period="${label}">
                <div class="top-block1 mt-1 p-1">
                    <span>${label}</span>
                </div>
                <div class="bottom-blocks1 mb-1">
                    <div class="left-block1 stage-card" data-stage="Closed Lost" style="cursor:pointer;">
                        <h6>Open</h6>
                        <p class="yellow" title="${open}">${open}</p>
                    </div>
                    <div class="center-block1 stage-card" data-stage="Proposal" style="cursor:pointer;">
                        <h6>Commited</h6>
                        <p class="blue" title="${proposal}">${proposal}</p>
                    </div>
                    <div class="right-block1 stage-card" data-stage="Closed Won" style="cursor:pointer;">
                        <h6>Achieved</h6>
                        <p class="green" title="${won}">${won}</p>
                    </div>
                </div>
            </div>
        `;
    });
    this.closeAllDropdowns();
    // Inject cards
    container.innerHTML = html;
    //console.log("loadData: Injected cards:", periods.length)
    const tableWrapper = document.createElement("div");
    tableWrapper.id = "opportunity-table-container";
    tableWrapper.className = "row mt-3 mb-3";
    tableWrapper.style.backgroundColor = "#F3F3F3";
    tableWrapper.style.borderRadius = "10px";
    tableWrapper.style.display = "none";

    tableWrapper.innerHTML = `
        <div class="col-12 d-flex flex-wrap justify-content-between align-items-center mt-3">
            <div id="table-title" style="font-weight:600; font-size:14px; margin-bottom:10px;"></div>

            <div class="filter-section-responsive" id="filter-section">

                <div class="custom-dropdown-wrapper">
                    <div class="select-btn" id="opportunity-type">
                        <span class="btn-text">Opportunity Type</span>
                        <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div class="list-items">
                        <div class="search-box">
                            <input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type">
                        </div>
                        <ul class="items-list" id="itemsList-opportunity-type"></ul>
                    </div>
                </div>

                <div class="custom-dropdown-wrapper">
                    <div class="select-btn" id="item-group-filter">
                        <span class="btn-text">Item Group</span>
                        <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div class="list-items">
                        <div class="search-box">
                            <input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter">
                        </div>
                        <ul class="items-list" id="itemsList-item-group-filter"></ul>
                    </div>
                </div>

                <div class="custom-dropdown-wrapper">
                    <div class="select-btn" id="brand-filter">
                        <span class="btn-text">Brand</span>
                        <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    <div class="list-items">
                        <div class="search-box">
                            <input type="text" placeholder="Search..." class="search-input" data-target="brand-filter">
                        </div>
                        <ul class="items-list" id="itemsList-brand-filter"></ul>
                    </div>
                </div>

            </div>
        </div>

        <div class="col-12 p-2">
            <div style="height:100%; max-height:300px; overflow-y:auto; overflow-x:auto; border:1px solid #dee2e6; border-radius:5px; background:white;">
                <table id="opportunities-table" class="table table-bordered w-100 mb-0"></table>
            </div>

            <div class="list-paging-area level mb-2 mt-2" style="padding:5px;">
                <div class="level-left">
                    <div class="btn-group">
                        <button class="btn btn-sm b1 mr-2" data-count="20">20</button>
                        <button class="btn btn-sm bl mr-2" data-count="100">100</button>
                        <button class="btn btn-sm b1 mr-2" data-count="500">500</button>
                        <button class="btn btn-sm b1" data-count="1500">1500</button>
                    </div>
                </div>

                <div class="level-right">
                    <button class="btn btn-sm" id="load-more-btn">Load More</button>
                </div>
            </div>
        </div>
    `;

    // Append wrapper into container
    container.appendChild(tableWrapper);
    this.multiselectDropdowns();
    //console.log("loadData: Opportunities loaded:", this.allOpportunities.length);
    // ---------- CARD CLICK HANDLERS ----------
    const cards = Array.from(container.querySelectorAll(".performance-period-card .stage-card"));
    //console.log("loadData: found stage cards:", cards.length);
    cards.forEach(cardEl => {
        cardEl.addEventListener("click", evt => {
            evt.stopPropagation();
            this.closeAllDropdowns();
            //console.groupCollapsed("PERF: card click");
            const liveWrapper = document.getElementById("opportunity-table-container");
            if (!liveWrapper) {
                console.error("card click: wrapper missing");
                console.groupEnd();
                return;
            }
            const periodCard = cardEl.closest(".performance-period-card");
            const period = periodCard.dataset.period;
            const stage = cardEl.dataset.stage;
            //console.log("clicked:", { stage, period });
            // toggle off
            if (this.activeStage &&
                this.activeStage.stage === stage &&
                this.activeStage.period === period) {
                this.activeStage = null;
                liveWrapper.style.display = "none";
                this.clearActivePerformanceStyles();
                this.clearAllDropdownFilters();
                console.groupEnd();
                return;
            }

            this.clearAllDropdownFilters();
            // RE-FIND ALL CARDS
            const allCards = Array.from(container.querySelectorAll(".performance-period-card"));
            const index = allCards.indexOf(periodCard);
            const rowIndex = Math.floor(index / 4);
            const insertPos = (rowIndex + 1) * 4;
            const afterCard = allCards[insertPos - 1];

            // Move wrapper under correct row
            if (liveWrapper.parentNode) liveWrapper.parentNode.removeChild(liveWrapper);
            if (afterCard && afterCard.parentNode) {
                afterCard.parentNode.insertBefore(liveWrapper, afterCard.nextSibling);
            } else {
                container.appendChild(liveWrapper);
            }
            liveWrapper.style.display = "block";
            document.getElementById("table-title").textContent =
                `${stage} – ${period}`;
            // store active
            this.activeStage = { stage, period };
            // Filter table rows
            this.currentFilteredStageRows = this.allOpportunities.filter(
                r => r.sales_stage === stage && r._period_label === period
            );
            //console.log("Rows for table:", this.currentFilteredStageRows.length);
            this.renderOpportunitiesTable(this.currentFilteredStageRows, true);
            this.clearActivePerformanceStyles();
            this.highlightActivePerformanceCard(stage, period);
            //console.groupEnd();
        });
    });

    //console.log("loadData(): Completed");
}*/

/**frappe.pages['performance-dashboar'].on_page_load = function (wrapper) {
    new PerformanceDashboard(wrapper);
}

frappe.router.on('change', () => {
    const route = frappe.get_route();
    if (frappe.PerformanceDashboard_page && route[0] !== "performance-dashboar") {
        location.reload(); // Reload the page
    }
});

class PerformanceDashboard {
    constructor(wrapper) {
        this.page = frappe.ui.make_app_page({
            parent: wrapper,
            title: 'Performance Dashboard',
            single_column: true
        });
        this.allOpportunities = [];   // all rows returned from backend
        this.activeStage = null;      // selected stage (Closed Won/Lost/Proposal)
        this.currentTableBody = null;
        this.totalFilteredRows = [];
        this.visibleRowCount = 0;
        this.selectedRowCount = 20;
        this.currentFilteredStageRows = [];   // STORE stage/period filtered rows

        this.load_css(() => {
            this.make();
        });
    }

    load_css(callback) {
        const faLink = document.createElement("link");
        faLink.rel = "stylesheet";
        faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
        document.head.appendChild(faLink);

        frappe.require([
            "/assets/renewal_module/css/employee-dashboard/style.bundle1.css"
        ], () => {
            if (callback) callback();
        });
    }

    make() {
        $(this.page.main).append(frappe.PerformanceDashboard_page.body);
        this.bindEvents();
        this.toggleDateFields();
        this.loadData();
        this.multiselectDropdowns();
    }

    bindEvents() {
        const timeFilter = document.getElementById("time-filter");
        const periodicity = document.getElementById("periodicity");
        const fromDate = document.getElementById("from-date");
        const toDate = document.getElementById("to-date");

        const callIfReady = () => {
            const tf = timeFilter?.value;
            const from = fromDate?.value;
            const to = toDate?.value;

            if (tf === "custom") {
                // Only call when both from and to are filled
                if (from && to) {
                    this.loadData();
                }
            } else {
                this.loadData();
            }
        };

        // Time filter change
        if (timeFilter) {
            timeFilter.addEventListener("change", () => {
                this.toggleDateFields();
                callIfReady();
            });
        }

        // Periodicity change
        if (periodicity) {
            periodicity.addEventListener("change", () => callIfReady());
        }

        // From / To date changes
        if (fromDate && toDate) {
            fromDate.addEventListener("change", () => callIfReady());
            toDate.addEventListener("change", () => callIfReady());
        }

        // Setup date display inputs (same as before)
        const allRealInputs = [fromDate, toDate].filter(Boolean);
        const setupDisplayDateField = (displayId, realId, allInputs) => {
            const displayInput = document.getElementById(displayId);
            const realInput = document.getElementById(realId);

            const hideAll = () => allInputs.forEach(i => {
                i.style.opacity = "0";
                i.style.pointerEvents = "none";
            });

            displayInput.addEventListener("click", () => {
                hideAll();
                // Get bounding box of display field
                const rect = displayInput.getBoundingClientRect();
                const parentRect = displayInput.offsetParent?.getBoundingClientRect() || { top: 10, left: 0 };
                // Use absolute positioning relative to parent container, not viewport
                realInput.style.position = "absolute";
                realInput.style.left = `${rect.left - parentRect.left}px`;
                realInput.style.top = `${rect.bottom - parentRect.top + 4}px`;
                realInput.style.width = `${rect.width}px`;
                realInput.style.height = `${rect.height}px`;
                realInput.style.zIndex = "9999";
                realInput.style.opacity = "1";
                realInput.style.pointerEvents = "auto";
                // ✅ Show the calendar immediately
                setTimeout(() => {
                    realInput.focus();
                    if (realInput.showPicker) realInput.showPicker();
                }, 50);
            });

            realInput.addEventListener("change", () => {
                if (realInput.value) {
                    const [yyyy, mm, dd] = realInput.value.split("-");
                    displayInput.value = `${dd}-${mm}-${yyyy}`;
                }
                hideAll();
            });

            realInput.addEventListener("blur", () => setTimeout(hideAll, 100));
        };


        setupDisplayDateField("from-date-display", "from-date", allRealInputs);
        setupDisplayDateField("to-date-display", "to-date", allRealInputs);
    }


    toggleDateFields() {
        const timeFilter = document.getElementById("time-filter");
        const customDateFields = document.getElementById("custom-date-fields");
        const fromDate = document.getElementById("from-date");
        const toDate = document.getElementById("to-date");
        const fromDisplay = document.getElementById("from-date-display");
        const toDisplay = document.getElementById("to-date-display");

        if (!timeFilter || !customDateFields) return;

        if (timeFilter.value === "custom") {
            //Show custom date inputs
            customDateFields.classList.remove("hidden");

            // 🧹 Clear old dates when switching back to custom
            if (fromDate) fromDate.value = "";
            if (toDate) toDate.value = "";
            if (fromDisplay) fromDisplay.value = "";
            if (toDisplay) toDisplay.value = "";

        } else {
            //Hide custom date inputs & clear all date values
            customDateFields.classList.add("hidden");

            if (fromDate) fromDate.value = "";
            if (toDate) toDate.value = "";
            if (fromDisplay) fromDisplay.value = "";
            if (toDisplay) toDisplay.value = "";
        }
    }

    async loadData() {
        const timeFilterEl = document.getElementById("time-filter");
        const periodicityEl = document.getElementById("periodicity");
        const fromDateEl = document.getElementById("from-date");
        const toDateEl = document.getElementById("to-date");

        const timeFilter = timeFilterEl ? timeFilterEl.value : null;
        const periodicity = periodicityEl ? periodicityEl.value : null;
        const fromDate = fromDateEl ? fromDateEl.value : null;
        const toDate = toDateEl ? toDateEl.value : null;

        //Prevent call if custom filter but dates not filled yet
        if (timeFilter === "custom" && (!fromDate || !toDate)) {
            console.log("Custom range selected but From/To date missing — skipping loadData()");
            return;
        }

        // Helper to get container element in a safe way (supports jQuery-wrapped page.main)
        const getContainerEl = () => {
            if (!this.page) return null;
            // If page.main is a DOM element
            if (this.page.main && this.page.main.querySelector) {
                return this.page.main.querySelector(".box6");
            }
            // If page.main is a jQuery/zepto object
            if (this.page.main && typeof this.page.main.find === "function") {
                const jq = this.page.main.find(".box6");
                return jq && jq.length ? jq.get(0) : null;
            }
            // Fallback: try whole document
            return document.querySelector(".box6");
        };

        const container = getContainerEl();

        if (!container) {
            console.error("PerformanceDashboard.loadData: .box6 container not found");
            return;
        }

        // show loading
        container.innerHTML = `<p class="text-muted m-3">Loading data...</p>`;

        try {
            const resp = await frappe.call({
                method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_opp_data",
                args: {
                    time_filter: timeFilter,
                    periodicity: periodicity,
                    from_date: fromDate || null,
                    to_date: toDate || null
                }
            });

            const data = (resp && resp.message) ? resp.message : [];
            console.log("opportunity data", data);
            this.allOpportunities = [];
            if (!data || !data.length) {
                container.innerHTML = `<p class="text-muted m-3">No data found for the selected period.</p>`;
                return;
            }

            // Format helper: currency INR with grouping
            const formatCurrency = (v) => {
                const num = Number(v || 0);
                return "₹" + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            };

            // Build HTML for cards
            let html = ``;
            data.forEach((row, i) => {
                const periodLabel = row.period || `Period ${i + 1}`;
                const cv = row.proposal || 0;
                const av = row.closed_won || 0;
                const open = row.closed_lost || 0;

                if (Array.isArray(row.row) && row.row.length) {
                    row.row.forEach(r => {
                        r._period_label = row.period;   // attach period label
                        this.allOpportunities.push(r);
                    });
                }

                html += `
                    <div class="widget-card1 performance-period-card" data-period="${periodLabel}">
                        <div class="top-block1 mt-1">
                            <span title="${periodLabel}">${periodLabel}</span>
                        </div>
                        <div class="bottom-blocks1 mb-1">
                            <div class="left-block1 stage-card"  data-stage="Closed Lost" title="Closed Lost" style="flex:1; cursor:pointer;">
                                <h6 title="Open Value">Open</h6>
                                <p class="yellow" title="${formatCurrency(open)}">${formatCurrency(open)}</p>
                            </div>
                            <div class="center-block1 stage-card" data-stage="Proposal" title="Proposal" style="cursor:pointer;">
                                <h6 title="Commited Value">Commited</h6>
                                <p class="blue" title="${formatCurrency(cv)}">${formatCurrency(cv)}</p>
                            </div>
                            <div class="right-block1 stage-card" data-stage="Closed Won" title="Closed Won" style="flex:1; cursor:pointer; text-align:center;">
                                <h6 title="Achieved Value">Achieved</h6>
                                <p class="green" title="${formatCurrency(av)}">${formatCurrency(av)}</p>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            document.querySelectorAll(".performance-period-card .stage-card").forEach(el => {
                el.addEventListener("click", (evt) => {
                    // Stop propagation to prevent parent handling (if any)
                    evt.stopPropagation();
                    const stage = el.getAttribute("data-stage");
                    // Determine period if we want to filter by period as well
                    const periodCard = el.closest(".performance-period-card");
                    const periodLabel = periodCard ? periodCard.getAttribute("data-period") : null;

                    // If same stage clicked again, toggle off
                    if (this.activeStage && this.activeStage.stage === stage && this.activeStage.period === periodLabel) {
                        this.activeStage = null;
                        this.renderOpportunitiesTable([], false);
                        this.clearActivePerformanceStyles();
                        return;
                    }
                    this.clearAllDropdownFilters();
                    const tableTitle = document.getElementById("table-title");
                    if (tableTitle) {
                        tableTitle.textContent = `${stage} – ${periodLabel}`;
                    }

                    // Set activeStage
                    this.activeStage = { stage, period: periodLabel };
                    this.currentFilteredStageRows = this.allOpportunities.filter(r => {
                        const stageMatch = r.sales_stage === stage;
                        const periodMatch = periodLabel ? r._period_label === periodLabel : true;
                        return stageMatch && periodMatch;
                    });

                    this.renderOpportunitiesTable(this.currentFilteredStageRows, true);
                    this.highlightActivePerformanceCard(stage, periodLabel);
                });
            });

            // Prepare opportunity table container hidden by default (it will be shown on click)
            const tableWrapper = document.getElementById("opportunity-table-container");
            if (tableWrapper) tableWrapper.style.display = "none";

        } catch (err) {
            console.error("Error loading data:", err);
            container.innerHTML = `<p class="text-danger m-3">Failed to load data.</p>`;
        }


    }


    clearAllDropdownFilters() {
        // Clear UI checkmarks
        document.querySelectorAll(".items-list .item.checked").forEach(item => {
            item.classList.remove("checked");
        });
        // Reset button label text
        document.querySelectorAll(".select-btn .btn-text").forEach(btn => {
            btn.textContent = btn.dataset.defaultLabel || btn.textContent;
        });
        // Reset internal selected lists for ALL dropdowns
        if (this.selectedFilters) {
            Object.keys(this.selectedFilters).forEach(key => {
                this.selectedFilters[key].clear();
            });
        }
        // Reset custom arrays used by filter logic
        this.currentFilterBrands = [];
        this.currentFilterItemGroups = [];
        this.currentFilterOppTypes = [];
    }

    highlightActivePerformanceCard(stage, periodLabel = null) {
        // remove previous
        this.clearActivePerformanceStyles();
        // find matching elements
        document.querySelectorAll(".performance-period-card").forEach(card => {
            const cardPeriod = card.getAttribute("data-period");
            const nodes = Array.from(card.querySelectorAll(".stage-card"));
            nodes.forEach(node => {
                const nodeStage = node.getAttribute("data-stage");
                if (nodeStage === stage && (!periodLabel || cardPeriod === periodLabel)) {
                    node.classList.add("active-stage-card");
                }
            });
        });
    }

    clearActivePerformanceStyles() {
        document.querySelectorAll(".performance-period-card .stage-card").forEach(node => {
            node.classList.remove("active-stage-card");
        });
    }

    renderOpportunitiesTable(data, show = true) {
        // Keep allOpportunities intact - this receives filtered rows
        this.allFilteredOpportunities = Array.isArray(data) ? data : [];

        const tableWrapper = document.getElementById("opportunity-table-container");
        if (!tableWrapper) {
            console.warn("opportunity-table-container not found in DOM.");
            return;
        }
        tableWrapper.style.display = show ? "block" : "none";

        const table = document.getElementById("opportunities-table");
        if (!table) {
            console.warn("opportunities-table not found in DOM.");
            return;
        }

        // Ensure table has thead and tbody
        let thead = table.querySelector("thead");
        if (!thead) {
            thead = document.createElement("thead");
            table.insertBefore(thead, table.firstChild);
        }
        let tbody = table.querySelector("tbody");
        if (!tbody) {
            tbody = document.createElement("tbody");
            table.appendChild(tbody);
        }

        tbody.innerHTML = "";
        thead.innerHTML = "";

        if (!data || data.length === 0) {
            thead.innerHTML = "";
            tbody.innerHTML = `<tr><td colspan="100%" class="text-center">No records found</td></tr>`;
            // Reset pagination highlight
            const bottomButtons = document.querySelectorAll(".list-paging-area .btn-group .btn");
            bottomButtons.forEach(btn => btn.classList.remove("bl"));

            // Reset Load More highlight
            const loadMoreBtn = document.getElementById("load-more-btn");
            if (loadMoreBtn) loadMoreBtn.classList.remove("bl");
            this.currentTableBody = tbody;
            this.totalFilteredRows = Array.from(tbody.querySelectorAll("tr"));
            if (loadMoreBtn) {
                if (this.totalFilteredRows.length > this.visibleRowCount) {
                    loadMoreBtn.style.display = "inline-block";
                } else {
                    loadMoreBtn.style.display = "none";
                }
            }

            return;
        }

        // Build header from keys of first object (skip item_row as earlier)
        const keys = Object.keys(data[0]).filter(k => k !== "item_row" && k !== "_period_label");
        const headerRow = document.createElement("tr");

        const snTh = document.createElement("th");
        snTh.textContent = "S.No";
        snTh.style.minWidth = "40px";
        snTh.style.maxWidth = "60px";
        snTh.style.textAlign = "center";
        snTh.style.position = "sticky";
        snTh.style.top = "0";
        snTh.style.zIndex = "3";
        snTh.style.backgroundColor = "#f8f9fa";
        headerRow.appendChild(snTh);

        keys.forEach(key => {
            const th = document.createElement("th");
            th.textContent = this.prettyLabel(key);
            th.style.position = "sticky";
            th.style.top = "0";
            th.style.backgroundColor = "#f8f9fa";
            th.style.minWidth = ["name", "item_code"].includes(key) ? "150px" : "80px";
            th.style.maxWidth = ["name", "item_code"].includes(key) ? "300px" : "160px";
            th.style.overflow = "hidden";
            th.style.textOverflow = "ellipsis";
            th.style.whiteSpace = "nowrap";
            th.title = this.prettyLabel(key);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // Populate rows
        data.forEach((item, index) => {
            const row = document.createElement("tr");
            const snTd = document.createElement("td");
            snTd.textContent = index + 1;
            snTd.style.textAlign = "center";
            snTd.style.fontWeight = "600";
            row.appendChild(snTd);

            keys.forEach(key => {
                const td = document.createElement("td");
                let value = item[key] !== null && item[key] !== undefined ? item[key] : "";

                // Numeric formatting for monetary fields
                if (["amount", "buying_amount", "gross_profit", "net_profit", "margin", "mdf", "support", "orc"].includes(key) && !isNaN(Number(value))) {
                    const formatted = this.formatIndianNumber(Number(value));
                    td.textContent = `₹ ${formatted}`;
                    td.title = formatted;
                    td.style.textAlign = "right";
                } else if (key === "name") {
                    const link = document.createElement("a");
                    link.href = `/app/opportunity/${value}`;
                    link.textContent = value;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.style.textDecoration = "none";
                    link.style.color = "#007bff";
                    link.title = value;
                    td.appendChild(link);
                } else {
                    td.textContent = value;
                    td.title = value;
                }

                // width and ellipsis
                td.style.minWidth = ["name", "item_code"].includes(key) ? "150px" : "80px";
                td.style.maxWidth = ["name", "item_code"].includes(key) ? "300px" : "160px";
                td.style.overflow = "hidden";
                td.style.textOverflow = "ellipsis";
                td.style.whiteSpace = "nowrap";

                row.appendChild(td);
            });

            tbody.appendChild(row);
        });

        this.currentTableBody = tbody;
        this.totalFilteredRows = Array.from(tbody.querySelectorAll("tr"));
        this.selectedRowCount = 20;
        this.visibleRowCount = 20;
        this.showRows(this.selectedRowCount);
        // BIND bottom pagination (only one section)
        const bottomButtons = document.querySelectorAll(".list-paging-area .btn-group .btn");
        const defaultCount = 20;
        // Ensure default highlight
        bottomButtons.forEach(btn => btn.classList.remove("bl"));
        bottomButtons.forEach(btn => {
            if (Number(btn.getAttribute("data-count")) === defaultCount) {
                btn.classList.add("bl");
            }
        });

        // Bind click events
        bottomButtons.forEach(btn => {
            btn.onclick = () => {
                const count = Number(btn.getAttribute("data-count"));

                // Highlight only clicked
                bottomButtons.forEach(b => b.classList.remove("bl"));
                btn.classList.add("bl");

                // Update table
                this.showRows(count);
            };
        });

        // Load More Button
        const loadMoreBtn = document.getElementById("load-more-btn");
        if (loadMoreBtn) {
            if (this.totalFilteredRows.length > this.visibleRowCount) {
                loadMoreBtn.style.display = "inline-block";
            } else {
                loadMoreBtn.style.display = "none";
            }
        }

    }


    resetPagingButtons() {
        const buttons = document.querySelectorAll(".list-paging-area .btn-group .btn");
        buttons.forEach(btn => btn.classList.remove("bl"));

        // Default 20
        buttons.forEach(btn => {
            if (Number(btn.getAttribute("data-count")) === 20) {
                btn.classList.add("bl");
            }
        });

        this.selectedRowCount = 20;
        this.visibleRowCount = 20;
    }


    showRows(count = 20, button = null) {
        const loadMoreBtn = document.getElementById("load-more-btn");
        if (loadMoreBtn) loadMoreBtn.classList.remove("bl");

        if (button) {
            document.querySelectorAll(".list-paging-area .btn-group .btn")
                .forEach(btn => btn.classList.remove("bl"));

            button.classList.add("bl");
            this.selectedRowCount = count;
        } else {
            this.selectedRowCount = count;
        }
        // If there are no rows, nothing to show
        if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) {
            this.visibleRowCount = 0;
            if (loadMoreBtn) loadMoreBtn.style.display = "none";
            return;
        }
        this.visibleRowCount = Math.min(Number(count) || 0, this.totalFilteredRows.length);
        if (!this.visibleRowCount) {
            this.visibleRowCount = Math.min(20, this.totalFilteredRows.length);
        }
        this.totalFilteredRows.forEach(row => row.style.display = "none");
        this.totalFilteredRows.slice(0, this.visibleRowCount).forEach(row => row.style.display = "");
        if (loadMoreBtn) {
            if (this.totalFilteredRows.length > this.visibleRowCount) {
                loadMoreBtn.style.display = "inline-block";
            } else {
                loadMoreBtn.style.display = "none";
            }
        }
    }


    loadMoreRows() {
        if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) return;
        // Remove highlight from number buttons
        document.querySelectorAll(".list-paging-area .btn-group .btn")
            .forEach(btn => btn.classList.remove("bl"));
        // Highlight LOAD MORE button
        document.getElementById("load-more-btn").classList.add("bl");
        const nextCount = 100;
        const rowsToShow = this.totalFilteredRows.slice(
            this.visibleRowCount,
            this.visibleRowCount + nextCount
        );
        rowsToShow.forEach(row => row.style.display = "");
        this.visibleRowCount += rowsToShow.length;
        // Hide Load More if no more rows left
        const loadMoreBtn = document.getElementById("load-more-btn");
        if (loadMoreBtn) {
            if (this.visibleRowCount >= this.totalFilteredRows.length) {
                loadMoreBtn.style.display = "none";
            }
        }

    }


    formatIndianNumber(number) {
        const num = Number(number);
        if (isNaN(num)) return number;
        return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }

    prettyLabel(key) {
        return key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    }

    filterTableByStage(stage) {
        if (!Array.isArray(this.allOpportunities)) {
            console.error("allOpportunities is not an array.");
            return;
        }
        const filtered = this.allOpportunities.filter(opp => opp.sales_stage === stage);
        this.renderOpportunitiesTable(filtered, true);
        this.highlightActivePerformanceCard(stage);
    }

    filterTableByItemGroupAndBrand(itemGroups = [], brands = [], oppTypes = []) {
        const baseRows = this.currentFilteredStageRows.length
            ? this.currentFilteredStageRows
            : this.allOpportunities;

        const filtered = baseRows.filter(opp => {
            const matchGroup = itemGroups.length ? itemGroups.includes(opp.item_group) : true;
            const matchBrand = brands.length ? brands.includes(opp.brand) : true;
            const matchOppType = oppTypes.length ? oppTypes.includes(opp.opportunity_type) : true;
            return matchGroup && matchBrand && matchOppType;
        });

        this.renderOpportunitiesTable(filtered, true);
        this.resetPagingButtons();
    }


    multiselectDropdowns() {
        const setupCustomDropdown = ({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) => {
            const selectBtn = document.getElementById(targetId);
            const btnText = selectBtn?.querySelector(".btn-text");
            const itemList = document.getElementById(`itemsList-${targetId}`);
            const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
            this.selectedFilters = this.selectedFilters || {};
            this.selectedFilters[targetId] = new Set();
            let selectedItems = this.selectedFilters[targetId];


            if (!selectBtn || !btnText || !itemList || !searchBox) {
                return;
            }

            const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
            btnText.dataset.defaultLabel = defaultLabel;
            btnText.textContent = defaultLabel;

            selectBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".select-btn").forEach(btn => {
                    if (btn !== selectBtn) btn.classList.remove("open");
                });
                selectBtn.classList.toggle("open");
            });

            document.addEventListener("click", (e) => {
                if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
                    selectBtn.classList.remove("open");
                }
            });

            searchBox.addEventListener("keyup", function () {
                const searchTerm = this.value.toLowerCase();
                itemList.querySelectorAll(".item").forEach(item => {
                    const text = item.innerText.toLowerCase();
                    item.style.display = text.includes(searchTerm) ? "flex" : "none";
                });
            });

            function renderItems(list) {
                itemList.innerHTML = "";
                list.forEach(item => {
                    const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
                    const li = document.createElement("li");
                    li.className = "item";
                    li.setAttribute("data-value", value);
                    li.setAttribute("title", value);
                    li.innerHTML = `<span class="item-text">${value}</span>`;
                    itemList.appendChild(li);
                });
                bindItemEvents();
            }

            function bindItemEvents() {
                itemList.querySelectorAll(".item").forEach(item => {
                    item.addEventListener("click", function () {
                        const value = this.getAttribute("data-value");
                        if (selectedItems.has(value)) {
                            selectedItems.delete(value);
                            this.classList.remove("checked");
                        } else {
                            selectedItems.add(value);
                            this.classList.add("checked");
                        }
                        const selectedArray = Array.from(selectedItems);
                        btnText.textContent = selectedArray.length > 0 ? `${selectedArray.length} selected` : btnText.dataset.defaultLabel;
                        if (typeof onSelectionChange === "function") {
                            onSelectionChange(selectedArray);
                        }
                    });
                });
            }

            if (options.length) {
                renderItems(options);
            } else {
                // fetch from server
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype,
                        fields: [labelField],
                        order_by: labelField + " asc",
                        limit_page_length: 999
                    },
                    callback: function (r) {
                        if (r.message) {
                            const items = (r.message || []).map(it => ({ name: it[labelField] || it.name }));
                            renderItems(items);
                        }
                    }
                });
            }
        };

        // Opportunity Type
        frappe.model.with_doctype("Opportunity Item", () => {
            const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
            const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
            setupCustomDropdown({
                doctype: "Opportunity Type",
                targetId: "opportunity-type",
                options: oppTypes,
                onSelectionChange: (selectedOppTypes) => {
                    const itemGroups = this.getSelectedValues("item-group-filter");
                    const brands = this.getSelectedValues("brand-filter");
                    this.filterTableByItemGroupAndBrand(itemGroups, brands, selectedOppTypes);
                }
            });
        });

        // Brand
        setupCustomDropdown({
            doctype: "Brand",
            targetId: "brand-filter",
            options: [],
            onSelectionChange: (selectedBrands) => {
                const itemGroups = this.getSelectedValues("item-group-filter");
                const oppTypes = this.getSelectedValues("opportunity-type");
                this.filterTableByItemGroupAndBrand(itemGroups, selectedBrands, oppTypes);
            }
        });

        // Item Group
        setupCustomDropdown({
            doctype: "Item Group",
            targetId: "item-group-filter",
            onSelectionChange: (selectedGroups) => {
                // custom brand population logic from your previous code
                const brandList = document.getElementById("itemsList-brand-filter");
                const brandBtnText = document.querySelector("#brand-filter .btn-text");

                if (brandList) brandList.innerHTML = '';
                if (brandBtnText) brandBtnText.textContent = "Brand";

                const updateBrandList = (brands) => {
                    const uniqueBrands = [...new Set(brands.filter(Boolean))];
                    uniqueBrands.sort();
                    uniqueBrands.forEach(brand => {
                        const li = document.createElement("li");
                        li.className = "item";
                        li.setAttribute("data-value", brand);
                        li.setAttribute("title", brand);
                        li.innerHTML = `<span class="item-text">${brand}</span>`;
                        if (brandList) brandList.appendChild(li);
                    });

                    if (brandList) {
                        brandList.querySelectorAll(".item").forEach(item => {
                            item.addEventListener("click", (e) => {
                                const el = e.currentTarget;
                                el.classList.toggle("checked");
                                const checkedItems = brandList.querySelectorAll(".item.checked");
                                const labels = Array.from(checkedItems).map(i => i.innerText.trim());
                                if (brandBtnText) {
                                    brandBtnText.textContent = labels.length > 0
                                        ? (labels.join(", ").length > 15 ? labels.join(", ").substring(0, 15) + "..." : labels.join(", "))
                                        : "Brand";
                                }
                                const brands = labels;
                                const oppTypes = this.getSelectedValues("opportunity-type");
                                const itemGroups = selectedGroups;
                                this.filterTableByItemGroupAndBrand(itemGroups, brands, oppTypes);
                            });
                        });
                    }
                };

                if (!selectedGroups.length) {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item",
                            fields: ["brand"],
                            limit_page_length: 999
                        },
                        callback: (res) => {
                            const items = res.message || [];
                            const brands = items.map(i => i.brand);
                            updateBrandList(brands);
                        }
                    });
                } else {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item",
                            fields: ["brand", "item_group"],
                            filters: [["item_group", "in", selectedGroups]],
                            limit_page_length: 999
                        },
                        callback: (res) => {
                            const items = res.message || [];
                            const brands = items.map(i => i.brand);
                            updateBrandList(brands);
                        }
                    });
                }

                const brands = this.getSelectedValues("brand-filter");
                const oppTypes = this.getSelectedValues("opportunity-type");
                this.filterTableByItemGroupAndBrand(selectedGroups, brands, oppTypes);
            }
        });
    }

    getSelectedValues(targetId) {
        const list = document.querySelectorAll(`#itemsList-${targetId} .item.checked`);
        return Array.from(list).map(item => item.getAttribute("data-value"));
    }

}

frappe.PerformanceDashboard_page = {
    body: `
        <div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
                <div class="title5">

                </div>
                <div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">

                    <select id="time-filter" class="form-select form-select-sm me-2" style="width:130px;">
                        <option value="last 6 months">Last 6 Months</option>
                        <option value="last quarter">Last Quarter</option>
                        <option value="last month">Last Month</option>
                        <option value="last week">Last Week</option>
                        <option value="this week">This Week</option>
                        <option value="this month">This Month</option>
                        <option value="this quarter">This Quarter</option>
                        <option value="this year" selected>This Year</option>
                        <option value="next week">Next Week</option>
                        <option value="next month">Next Month</option>
                        <option value="next quarter">Next Quarter</option>
                        <option value="next 6 months">Next 6 Months</option>
                        <option value="custom">Custom</option>
                    </select>

                    <div id="custom-date-fields" class="d-flex flex-wrap align-items-center ms-2 hidden">
                        <input type="text" id="from-date-display" class="form-control form-control-sm me-2"
                            placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
                        <input type="text" id="to-date-display" class="form-control form-control-sm"
                            placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

                        <input type="date" id="from-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
                        <input type="date" id="to-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
                    </div>

                    <select id="periodicity" class="form-select form-select-sm me-2" style="width:130px;">
                        <option value="weekly">Weekly</option>
                        <option value="monthly" selected>Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="row mt-2 d-flex align-items-stretch" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="col-12 d-flex flex-column">
                <div class="box6 m-2">
                    <!-- Dynamic cards will appear here -->
                </div>
            </div>
        </div>

        <div class="row mt-2 d-flex align-items-stretch" style="border-radius:10px;background-color:#F3F3F3;">
           <div class="col-12">
                <div id="opportunity-table-container" class="row mt-3 mb-3" style="background-color:#F3F3F3;border-radius:10px; display: none;">
                    <div class="col-12 d-flex flex-wrap justify-content-between align-items-center mt-3">
                        <div id="table-title" style="font-weight:600; font-size:14px; margin-bottom:10px;"></div>
                        <div class="filter-section-responsive" id="filter-section">
                            <div class="custom-dropdown-wrapper">
                                <div class="select-btn" id="opportunity-type">
                                    <span class="btn-text">Opportunity Type</span>
                                    <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                                </div>
                                <div class="list-items">
                                    <div class="search-box">
                                        <input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type">
                                    </div>
                                    <ul class="items-list" id="itemsList-opportunity-type"></ul>
                                </div>
                            </div>
                            <div class="custom-dropdown-wrapper">
                                <div class="select-btn" id="item-group-filter">
                                    <span class="btn-text">Item Group</span>
                                    <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                                </div>
                                <div class="list-items">
                                    <div class="search-box">
                                        <input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter">
                                    </div>
                                    <ul class="items-list" id="itemsList-item-group-filter"></ul>
                                </div>
                            </div>
                            <div class="custom-dropdown-wrapper">
                                <div class="select-btn" id="brand-filter">
                                    <span class="btn-text">Brand</span>
                                    <span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
                                </div>
                                <div class="list-items">
                                    <div class="search-box">
                                        <input type="text" placeholder="Search..." class="search-input" data-target="brand-filter">
                                    </div>
                                    <ul class="items-list" id="itemsList-brand-filter"></ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-12 p-2">
                        <div style="height:100%; max-height:300px; overflow-y:auto; overflow-x:auto; border:1px solid #dee2e6; border-radius:5px; background:white;">
                            <table id="opportunities-table" class="table table-bordered w-100 mb-0"></table>
                        </div>

                        <div class="list-paging-area level mb-2 mt-2" style="padding:5px;">
                            <div class="level-left">
                                <div class="btn-group">
                                    <button class="btn btn-sm b1 mr-2" data-count="20">20</button>
                                    <button class="btn btn-sm bl mr-2" data-count="100">100</button>
                                    <button class="btn btn-sm b1 mr-2" data-count="500">500</button>
                                    <button class="btn btn-sm b1" data-count="1500">1500</button>
                                </div>
                            </div>

                            <div class="level-right">
                                <button class="btn btn-sm" id="load-more-btn">Load More</button>
                            </div>
                        </div>
                    </div>

                </div>
           </div>
        </div>
    `
};***/

// client-side: performance dashboard page
/**frappe.pages['performance-dashboar'].on_page_load = function (wrapper) {
    new PerformanceDashboard(wrapper);
}

frappe.router.on('change', () => {
    const route = frappe.get_route();
    if (frappe.PerformanceDashboard_page && route[0] !== "performance-dashboar") {
        location.reload(); // Reload the page when leaving
    }
});

class PerformanceDashboard {
    constructor(wrapper) {
        this.page = frappe.ui.make_app_page({
            parent: wrapper,
            title: 'Performance Dashboard',
            single_column: true
        });
        // default metric = achieved
        this.selectedMetric = "achieved";
        this.load_css(() => {
            this.make();
        });
    }

    load_css(callback) {
        frappe.require([
            "/assets/renewal_module/css/employee-dashboard/style.bundle1.css"
        ], () => {
            if (callback) callback();
        });
    }

    make() {
        $(this.page.main).append(frappe.PerformanceDashboard_page.body);
        this.renderMetricButtons();
        this.bindEvents();
        this.toggleDateFields();
        this.loadData();
    }

    // --- Replace existing renderMetricButtons() with this version ---
    renderMetricButtons() {
        const container = document.getElementById("metric-button-row");
        if (!container) {
            console.error("metric-button-row container not found");
            return;
        }

        if (this._metricBtnGroup) return; // already created

        const wrapper = document.createElement("div");
        wrapper.className = "d-flex gap-2 ms-auto";

        const makeBtn = (id, text, metric) => {
            const b = document.createElement("button");
            b.id = id;
            b.type = "button";
            b.dataset.metric = metric;

            // modern toggle pill button
            b.className = `btn btn-sm metric-btn`;
            b.innerText = text;

            // highlight selected
            if (metric === this.selectedMetric) {
                b.classList.add("metric-active");
            }

            b.addEventListener("click", () => {
                this.onMetricClick(metric);
            });

            return b;
        };

        wrapper.appendChild(makeBtn("metric-open", "Open", "open"));
        wrapper.appendChild(makeBtn("metric-committed", "Committed", "committed"));
        wrapper.appendChild(makeBtn("metric-achieved", "Achieved", "achieved"));

        container.appendChild(wrapper);
        this._metricBtnGroup = wrapper;
    }


    // --- Replace existing setActiveMetricButton() with this robust version ---
    setActiveMetricButton(metric) {
        if (!this._metricBtnGroup) return;

        const buttons = this._metricBtnGroup.querySelectorAll(".metric-btn");

        buttons.forEach(b => {
            if (b.dataset.metric === metric) {
                b.classList.add("metric-active");
            } else {
                b.classList.remove("metric-active");
            }
        });
    }



    onMetricClick(metric) {
        if (!metric) return;
        this.selectedMetric = metric;
        this.setActiveMetricButton(metric);
        this.loadData();
    }

    bindEvents() {
        const timeFilter = document.getElementById("time-filter");
        const periodicity = document.getElementById("periodicity");
        const fromDate = document.getElementById("from-date");
        const toDate = document.getElementById("to-date");

        const callIfReady = () => {
            const tf = timeFilter?.value;
            const from = fromDate?.value;
            const to = toDate?.value;

            if (tf === "custom") {
                if (from && to) {
                    this.loadData();
                }
            } else {
                this.loadData();
            }
        };

        if (timeFilter) {
            timeFilter.addEventListener("change", () => {
                this.toggleDateFields();
                callIfReady();
            });
        }

        if (periodicity) {
            periodicity.addEventListener("change", () => callIfReady());
        }

        if (fromDate && toDate) {
            fromDate.addEventListener("change", () => callIfReady());
            toDate.addEventListener("change", () => callIfReady());
        }

        // date display helpers (keeps previous improved logic)
        const allRealInputs = [fromDate, toDate].filter(Boolean);
        const setupDisplayDateField = (displayId, realId, allInputs) => {
            const displayInput = document.getElementById(displayId);
            const realInput = document.getElementById(realId);
            if (!displayInput || !realInput) return;

            const hideAll = () => allInputs.forEach(i => {
                i.style.opacity = "0";
                i.style.pointerEvents = "none";
            });

            displayInput.addEventListener("click", () => {
                hideAll();
                const rect = displayInput.getBoundingClientRect();
                const parentRect = displayInput.offsetParent?.getBoundingClientRect() || { top: 10, left: 0 };
                realInput.style.position = "absolute";
                realInput.style.left = `${rect.left - parentRect.left}px`;
                realInput.style.top = `${rect.bottom - parentRect.top + 4}px`;
                realInput.style.width = `${rect.width}px`;
                realInput.style.height = `${rect.height}px`;
                realInput.style.zIndex = "9999";
                realInput.style.opacity = "1";
                realInput.style.pointerEvents = "auto";
                setTimeout(() => {
                    realInput.focus();
                    if (realInput.showPicker) realInput.showPicker();
                }, 50);
            });

            realInput.addEventListener("change", () => {
                if (realInput.value) {
                    const [yyyy, mm, dd] = realInput.value.split("-");
                    displayInput.value = `${dd}-${mm}-${yyyy}`;
                }
                hideAll();
            });

            realInput.addEventListener("blur", () => setTimeout(hideAll, 100));
        };

        setupDisplayDateField("from-date-display", "from-date", allRealInputs);
        setupDisplayDateField("to-date-display", "to-date", allRealInputs);
    }

    toggleDateFields() {
        const timeFilter = document.getElementById("time-filter");
        const customDateFields = document.getElementById("custom-date-fields");
        const fromDate = document.getElementById("from-date");
        const toDate = document.getElementById("to-date");
        const fromDisplay = document.getElementById("from-date-display");
        const toDisplay = document.getElementById("to-date-display");

        if (!timeFilter || !customDateFields) return;

        if (timeFilter.value === "custom") {
            customDateFields.classList.remove("hidden");
            if (fromDate) fromDate.value = "";
            if (toDate) toDate.value = "";
            if (fromDisplay) fromDisplay.value = "";
            if (toDisplay) toDisplay.value = "";
        } else {
            customDateFields.classList.add("hidden");
            if (fromDate) fromDate.value = "";
            if (toDate) toDate.value = "";
            if (fromDisplay) fromDisplay.value = "";
            if (toDisplay) toDisplay.value = "";
        }
    }

    async loadData() {
        const timeFilterEl = document.getElementById("time-filter");
        const periodicityEl = document.getElementById("periodicity");
        const fromDateEl = document.getElementById("from-date");
        const toDateEl = document.getElementById("to-date");

        const timeFilter = timeFilterEl ? timeFilterEl.value : null;
        const periodicity = periodicityEl ? periodicityEl.value : null;
        const fromDate = fromDateEl ? fromDateEl.value : null;
        const toDate = toDateEl ? toDateEl.value : null;

        //Prevent call if custom filter but dates not filled yet
        if (timeFilter === "custom" && (!fromDate || !toDate)) {
            console.log("Custom range selected but From/To date missing — skipping loadData()");
            return;
        }

        // Helper to find the container
        const getContainerEl = () => {
            if (!this.page) return null;
            if (this.page.main && this.page.main.querySelector) {
                return this.page.main.querySelector(".box6");
            }
            if (this.page.main && typeof this.page.main.find === "function") {
                const jq = this.page.main.find(".box6");
                return jq && jq.length ? jq.get(0) : null;
            }
            return document.querySelector(".box6");
        };

        const container = getContainerEl();

        if (!container) {
            console.error("PerformanceDashboard.loadData: .box6 container not found");
            return;
        }

        // show loading
        container.innerHTML = `<p class="text-muted m-3">Loading data...</p>`;

        try {
            const resp = await frappe.call({
                method: "renewal_module.custom_module.page.performance_dashboar.performance_dashboar.get_opp_data",
                args: {
                    time_filter: timeFilter,
                    periodicity: periodicity,
                    from_date: fromDate || null,
                    to_date: toDate || null,
                    metric: this.selectedMetric  // new param
                }
            });

            const data = (resp && resp.message) ? resp.message : [];
            console.log("opportunity data", data);

            if (!data || !data.length) {
                container.innerHTML = `<p class="text-muted m-3">No data found for the selected period.</p>`;
                return;
            }

            // Format helper: currency INR with grouping
            const formatCurrency = (v) => {
                const num = Number(v || 0);
                return "₹" + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            };

            // Build HTML for cards: single metric block per card (no left/right split)
            let html = "";
            data.forEach((row, i) => {
                const periodLabel = row.period || `Period ${i + 1}`;
                const amount = row.amount || 0;

                // Title for the metric block (capitalized)
                const metricTitle = this.selectedMetric ? this.selectedMetric.charAt(0).toUpperCase() + this.selectedMetric.slice(1) : "Metric";
                let colorClass = "metric-blue"; // default Open

                if (this.selectedMetric === "achieved") {
                    colorClass = "metric-green";
                }
                else if (this.selectedMetric === "committed") {
                    colorClass = "metric-purple";
                }

                html += `
                <div class="widget-card1">
                    <div class="top-block1 mt-1">
                        <span title="${periodLabel}">${periodLabel}</span>
                    </div>
                    <div class="bottom-blocks1 mb-1 d-flex align-items-center justify-content-center">
                        <div class="single-block w-100 text-center">
                            <h6 title="${metricTitle}">${metricTitle}</h6>
                            <p class="${colorClass}" title="${formatCurrency(amount)}">${formatCurrency(amount)}</p>
                        </div>
                    </div>
                </div>
                `;
            });

            container.innerHTML = html;
            // ensure metric button UI set correctly
            this.setActiveMetricButton(this.selectedMetric);

        } catch (err) {
            console.error("Error loading data:", err);
            container.innerHTML = `<p class="text-danger m-3">Failed to load data.</p>`;
        }
    }
}

// page body remains same
frappe.PerformanceDashboard_page = {
    body: `
        <div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
                <div class="title5"></div>
                <div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">
                    <!-- metric buttons are injected by JS -->
                    <select id="time-filter" class="form-select form-select-sm me-2" style="width:130px;">
                        <option value="last 6 months">Last 6 Months</option>
                        <option value="last quarter">Last Quarter</option>
                        <option value="last month">Last Month</option>
                        <option value="last week">Last Week</option>
                        <option value="this week">This Week</option>
                        <option value="this month">This Month</option>
                        <option value="this quarter">This Quarter</option>
                        <option value="this year" selected>This Year</option>
                        <option value="next week">Next Week</option>
                        <option value="next month">Next Month</option>
                        <option value="next quarter">Next Quarter</option>
                        <option value="next 6 months">Next 6 Months</option>
                        <option value="custom">Custom</option>
                    </select>

                    <div id="custom-date-fields" class="d-flex flex-wrap align-items-center ms-2 hidden">
                        <input type="text" id="from-date-display" class="form-control form-control-sm me-2"
                            placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
                        <input type="text" id="to-date-display" class="form-control form-control-sm"
                            placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

                        <input type="date" id="from-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
                        <input type="date" id="to-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
                    </div>

                    <select id="periodicity" class="form-select form-select-sm me-2" style="width:130px;">
                        <option value="weekly">Weekly</option>
                        <option value="monthly" selected>Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>
            </div>

        </div>

        <div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="col-12">
                <div id="metric-button-row" class="d-flex align-items-center gap-2 mb-2 mt-2" style="margin-right: 10px;">
                </div>
            </div>
        </div>

        <div class="row mt-2 d-flex align-items-stretch" style="border-radius:10px;background-color:#F3F3F3;">
            <div class="col-12 d-flex flex-column">
                <div class="box6 m-2">
                    <!-- Dynamic cards will appear here -->
                </div>
            </div>
        </div>
    `
};**/



// frappe.pages['performance-dashboar'].on_page_load = function(wrapper) {
//     new PerformanceDashboard(wrapper);
// }

// class PerformanceDashboard {
//     constructor(wrapper) {
//         this.page = frappe.ui.make_app_page({
//             parent: wrapper,
//             title: 'Performance Dashboard',
//             single_column: true
//         });

//         this.make_filters();
//         this.make_cards();
//     }

//     make_filters() {
//         let me = this;

//         this.filters = {
//             timespan: this.page.add_field({
//                 fieldname: 'timespan',
//                 label: 'Time Span',
//                 fieldtype: 'Select',
//                 options: ['Yearly', 'Quarterly', 'Monthly', 'Weekly'],
//                 default: 'Monthly',
//                 change() {
//                     me.make_cards();
//                 }
//             })
//         };
//     }

//     async make_cards() {
//         let timespan = this.filters.timespan.get_value();
//         let container = $(`
//             <div class="card-container grid grid-cols-2 gap-4 mt-4"></div>
//         `);
//         this.page.main.html(container);

//         // Fetch data from backend (Python)
//         let result = await frappe.call({
//             method: 'your_app.your_module.page.performance_dashboard.performance_dashboard.get_performance_data',
//             args: { timespan }
//         });

//         (result.message || []).forEach(row => {
//             let card = $(`
//                 <div class="p-4 bg-white shadow rounded-lg">
//                     <h4 class="font-bold mb-2">${row.label}</h4>
//                     <p>Committed: <b>${row.committed}</b></p>
//                     <p>Achieved: <b>${row.achieved}</b></p>
//                 </div>
//             `);
//             container.append(card);
//         });
//     }
// }