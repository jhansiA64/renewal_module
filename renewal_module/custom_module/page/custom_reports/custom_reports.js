frappe.pages['custom-reports'].on_page_load = function (wrapper) {
    frappe.custom_reports_page = new CustomerSummaryReportPage(wrapper);
};

frappe.pages['custom-reports'].on_page_show = function () {
    frappe.custom_reports_page.render();
};

class CustomerSummaryReportPage {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.reportData = [];
        this.expandedRows = new Set();
        this.currentPage = 1;
        this.pageSize = 20;
        this.basePageSize = this.pageSize;
        this.sortedCustomers = [];
        // debounced apply filters (will be initialized after debounce method exists)
        this.setupPage();
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    formatCurrency(value) {
        try {
            const num = Number(value) || 0;
            return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
        } catch (e) {
            return '₹' + (Number(value) || 0).toLocaleString('en-IN');
        }
    }

    setupPage() {
        // Clear wrapper
        $(this.wrapper).empty();
        
        // Create layout HTML with filters at top
        const layoutHTML = `
            <div class="customer-summary-layout">
                <!-- Navbar -->
                <nav class="summary-navbar">
                    <div class="navbar-content">
                        <div class="navbar-header">
                            <h2 class="navbar-title">👥 Customer Summary Report</h2>
                            
                        </div>
                        <div class="navbar-actions">
                            <button class="btn btn-sm btn-default" id="expand-all-btn">
                                <i class="octicon octicon-chevron-down"></i> Expand All
                            </button>
                            <button class="btn btn-sm btn-default" id="collapse-all-btn">
                                <i class="octicon octicon-chevron-right"></i> Collapse All
                            </button>
                            <button class="btn btn-sm btn-default" id="refresh-report">
                                <i class="octicon octicon-sync"></i> Refresh
                            </button>
                            <button class="btn btn-sm btn-primary" id="export-report">
                                <i class="octicon octicon-download"></i> Export
                            </button>
                        </div>
                    </div>
                </nav>

                <!-- Filter Section at Top -->
                <div class="filter-panel">
                    
                    <div class="filter-content">
                        <div class="filter-row">
                            <div class="filter-group">
                                <label>Customer Name</label>
                                <input type="text" id="filter-customer-name" class="form-control form-control-sm" placeholder="Search customer..." list="customer-name-list">
                                <datalist id="customer-name-list"></datalist>
                            </div>
                            <div class="filter-group">
                                <label>Sales Person</label>
                                <select id="filter-sales-person" class="form-control form-control-sm">
                                    <option value="">All</option>
                                </select>
                            </div>
                            
<!-- Billing Gap -->
<div class="filter-group">
  <label>Billing Gap</label>
  <select id="filter-billing-gap" class="form-control form-control-sm">
    <option value="" selected disabled>-- Select --</option>
    <option value="1">1 Year</option>
    <option value="2">2 Years</option>
    <option value="3">3 Years</option>
    <option value="4">4 Years</option>
    <option value="5">5 Years</option>
    <option value="custom">Custom</option>
  </select>
</div>

<!-- Billing Gap Date Range (occupies 2 columns on the same grid row) -->
<div class="filter-group range-2col" id="billing-gap-range" style="display:none;">
  <!-- Left column -->
  <div class="subgroup">
    <label for="billing-gap-from-date">From Date</label>
    <input type="date" id="billing-gap-from-date" class="form-control form-control-sm" />
  </div>

  <!-- Right column -->
  <div class="subgroup">
    <label for="billing-gap-to-date">To Date</label>
    <input type="date" id="billing-gap-to-date" class="form-control form-control-sm" />
  </div>
</div>



                            <div class="filter-group">
                                <label>Created By</label>
                                <select id="filter-created-by" class="form-control form-control-sm">
                                    <option value="">All</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>Territory</label>
                                <select id="filter-territory" class="form-control form-control-sm">
                                    <option value="">All</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>Industry</label>
                                <select id="filter-industry" class="form-control form-control-sm">
                                    <option value="">All</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>Min Amount (₹)</label>
                                <input type="number" id="filter-amount-from" class="form-control form-control-sm" placeholder="From">
                            </div>
                            <div class="filter-group">
                                <label>Max Amount (₹)</label>
                                <input type="number" id="filter-amount-to" class="form-control form-control-sm" placeholder="To">
                            </div>
                        </div>
                        <div class="filter-actions">
                            <button class="btn btn-sm btn-primary" id="apply-filters">
                                <i class="octicon octicon-search"></i> Apply Filters
                            </button>
                            <button class="btn btn-sm btn-default" id="reset-filters">
                                <i class="octicon octicon-x"></i> Reset Filters
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Main Content Area -->
                <div class="summary-content">
                   
                        
                        <div id="report-loading" class="alert alert-info" style="margin:0; display:none;">
                            <i class="fa fa-spinner fa-spin"></i> Loading report...
                        </div>
                        
                    
                    <div id="report-container" class="report-container">
                   
                        <!-- Hierarchical table will be rendered here -->
                    </div>
                    <!-- Pagination Footer (pill-style) -->
                    <div id="pagination-controls-bottom" style="margin-top:10px; display:flex; gap:8px; align-items:center; padding:10px; background:#fff; border-top:1px solid #eee; justify-content:space-between;">
                        <div style="display:flex; gap:8px; align-items:center;">
                            

                            <div class="page-size-pills" style="margin-left:12px; display:flex; gap:8px; align-items:center;">
                                <div class="page-size-pill" data-size="20">20</div>
                                <div class="page-size-pill" data-size="100">100</div>
                                <div class="page-size-pill" data-size="500">500</div>
                                <div class="page-size-pill" data-size="2500">2500</div>
                            </div>
                            <span id="total-count-bottom" style="margin-left:12px; color:#666;"></span>
                        </div>

                        <div>
                            <button class="btn btn-sm btn-default" id="load-more-btn">Load More</button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .customer-summary-layout {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    background: #f5f5f5;
                }

                .summary-navbar {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 15px 20px;
                    box-shadow: 0 3px 8px rgba(0,0,0,0.15);
                }

                .navbar-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .navbar-header {
                    flex: 1;
                }

                .navbar-title {
                    margin: 0;
                    font-size: 22px;
                    font-weight: 700;
                    color: #fff;
                }

                .navbar-subtitle {
                    margin: 4px 0 0 0;
                    font-size: 12px;
                    color: rgba(255,255,255,0.8);
                }

                .navbar-actions {
                    display: flex;
                    gap: 10px;
                }

                .navbar-actions .btn {
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: #fff;
                    padding: 6px 12px;
                    font-size: 12px;
                }

                .navbar-actions .btn:hover {
                    background: rgba(255,255,255,0.25);
                }

                .navbar-actions .btn-primary {
                    background: #fff;
                    color: #667eea;
                    border: none;
                }

                /* Filter Panel */
                .filter-panel {
                    background: #fff;
                    border-bottom: 1px solid #ddd;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .filter-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 20px;
                    border-bottom: 1px solid #eee;
                }

                .filter-header h5 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                }

                .filter-content {
                    padding: 15px 20px;
                }

                .filter-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 15px;
                    margin-bottom: 15px;
                }

                .filter-group {
                    display: flex;
                    flex-direction: column;
                }

                .filter-group label {
                    font-size: 11px;
                    font-weight: 600;
                    color: #555;
                    margin-bottom: 5px;
                }

                .filter-group input,
                .filter-group select {
                    font-size: 12px;
                }

                .filter-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-start;
                }
                    /* Make the date range block span 2 columns of the main filter grid
   and render two inner columns for From/To */
.range-2col {
  display: grid;
  grid-template-columns: 1fr 1fr; /* two equal columns */
  gap: 12px;
  grid-column: span 2; /* occupies two columns of the parent .filter-row grid */
  align-items: end; /* align inputs nicely if labels differ in height */
}

/* Inner groups (label + input) */
.range-2col .subgroup {
  display: flex;
  flex-direction: column;
}

/* (Optional) tighter spacing for this row */
.range-2col label {
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #555;
}

/* Make sure inputs don’t overflow in narrow screens */
.range-2col .form-control {
  min-width: 0;
}


                .summary-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    background: #fafafa;
                }

                .content-header {
                    background: #fff;
                    padding: 15px 20px;
                    border-bottom: 1px solid #ddd;
                    flex-shrink: 0;
                }

                .content-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: #333;
                }

                .report-container {
                    flex: 1;
                    overflow: auto;
                    padding: 0;
                }

                /* Parent-Child Hierarchical Table */
                .hierarchy-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: #fff;
                }

                .hierarchy-table thead {
                    background: #f8f9fa;
                    border-bottom: 2px solid #dee2e6;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .hierarchy-table th {
                    padding: 12px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 700;
                    color: #495057;
                    border-bottom: 1px solid #dee2e6;
                }

                .hierarchy-table td {
                    padding: 12px;
                    border-bottom: 1px solid #eee;
                    font-size: 13px;
                }

                /* Parent Row */
                .parent-row {
                    background: #fff;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .parent-row:hover {
                    background: #f0f4ff;
                }

                .parent-row td {
                    font-weight: 500;
                    color: #333;
                    border-bottom: 1px solid #ddd;
                }

                /* Child Row */
                .child-row {
                    background: #f9fafb;
                    display: none;
                }

                .child-row.show {
                    display: table-row;
                }

                .child-row td {
                    padding-left: 50px;
                    color: #666;
                    border-bottom: 1px solid #eee;
                    font-size: 12px;
                }

                /* Toggle Button */
                .toggle-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    margin: 0;
                    background: #f0f0f0;
                    border: 1px solid #ddd;
                    cursor: pointer;
                    color: #667eea;
                    font-size: 16px;
                    line-height: 1;
                    border-radius: 4px;
                    transition: all 0.3s ease;
                }

                .toggle-btn:hover {
                    background: #667eea;
                    color: #fff;
                    border-color: #667eea;
                    transform: scale(1.05);
                }

                .toggle-btn:active {
                    transform: scale(0.95);
                }

                .toggle-btn i {
                    transition: transform 0.3s ease;
                    display: inline-block;
                }

                .toggle-btn.expanded i {
                    transform: rotate(90deg);
                }

                /* Highlight colors for different child types */
                .child-contact {
                    border-left: 3px solid #17a2b8;
                }

                .child-invoice {
                    border-left: 3px solid #28a745;
                }

                .child-renewal {
                    border-left: 3px solid #ffc107;
                }

                /* Amount color classes */
                .amount-positive { color: #28a745; font-weight: 600; }
                .amount-warning { color: #d48806; font-weight: 600; }
                .amount-zero { color: #6c757d; font-weight: 600; }
                .amount-negative { color: #dc3545; font-weight: 600; }
                /* Scrollbar */
                .report-container::-webkit-scrollbar {
                    width: 8px;
                }

                .report-container::-webkit-scrollbar-track {
                    background: #f1f1f1;
                }

                .report-container::-webkit-scrollbar-thumb {
                    background: #ccc;
                    border-radius: 4px;
                }

                .report-container::-webkit-scrollbar-thumb:hover {
                    background: #999;
                }
                .contacts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 10px;
                }

                .contact-entry {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    padding: 8px 10px;
                    background: #fff;
                    border: 1px solid #eee;
                    border-radius: 6px;
                    box-shadow: 0 1px 0 rgba(0,0,0,0.02);
                }

                .contact-avatar {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: linear-gradient(135deg,#667eea,#764ba2);
                    color: #fff;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 14px;
                    flex-shrink: 0;
                }

                .contact-body {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .contact-name {
                    font-weight: 600;
                    color: #222;
                    font-size: 13px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .contact-meta {
                    margin-top: 4px;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }

                .contact-link { color: #555; font-size: 12px; text-decoration: none; }
                .contact-link:hover { color: #000; text-decoration: underline; }
                .contact-link i { margin-right: 6px; color: #888; }
                /* Pagination pill styles */
                .page-size-pills { display:flex; gap:8px; }
                .page-size-pill {
                    padding:8px 12px;
                    background:#f1f3f5;
                    border-radius:12px;
                    font-weight:600;
                    color:#333;
                    cursor:pointer;
                    border:1px solid rgba(0,0,0,0.04);
                    box-shadow: 0 1px 0 rgba(0,0,0,0.02);
                }
                .page-size-pill:hover { background:#ebefff; }
                .page-size-pill.active {
                    background: #6b46c1; /* purple */
                    color: #fff;
                    box-shadow: 0 4px 12px rgba(103,58,183,0.15);
                    transform: translateY(-1px);
                }

                #load-more-btn { border-radius:12px; padding:8px 14px; }
                
                /* Contact List View Styles */
                .contacts-list-view {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .contact-detail-row {
                    background: #f9fafb;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    padding: 12px;
                    margin-bottom: 8px;
                }

                .contact-detail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #ddd;
                }

                .contact-detail-header strong {
                    font-size: 14px;
                    color: #222;
                }

                .contact-actions {
                    display: flex;
                    gap: 8px;
                }

                .contact-actions .btn {
                    padding: 4px 8px;
                    font-size: 11px;
                }

                .contact-detail-body {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px 15px;
                }

                .detail-row {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                /* Compact single-line contact row with grid layout */
                .contact-row-compact {
                    display: grid;
                    grid-template-columns: 220px 1fr 42px;
                    gap: 12px;
                    align-items: center;
                    padding: 8px 10px;
                    background: #fff;
                    border: 1px solid #eee;
                    border-radius: 6px;
                }

                .contact-row-compact .contact-left {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    min-width: 0;
                    overflow: hidden;
                    grid-column: 1 / 3;
                }

                .contact-name-compact { font-weight: 600; color: #222; font-size:13px; width: 220px; min-width: 220px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                /* Ensure links and icons stay inline and don't wrap */
                .contact-row-compact .contact-left .contact-link { flex-shrink: 0; white-space: nowrap; text-decoration:none; display:inline-flex; align-items:center; gap:4px; color:#555; font-size:13px; }

                .contact-row-compact .contact-left .contact-link:hover { text-decoration:underline; color:#000; }

                .contact-icon { color: #667eea; font-size:13px; }

                .contact-right { display:flex; align-items:center; justify-content:center; width:42px; height:32px; grid-column: 3; }

                .contact-empty { color:#999; font-size:13px; }

                .contacts-column .contacts-list-view { display:flex; flex-direction:column; gap:8px; }

                .primary-contact { background: linear-gradient(90deg, #f7fbff 0%, #fff 100%); border-left: 3px solid #667eea; }
                .primary-badge { background:#667eea; color:#fff; padding:2px 6px; border-radius:12px; font-size:11px; }

                .address-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 6px;
                }

                .address-entry {
                    background: #fff;
                    border: 1px solid #eee;
                    padding: 8px;
                    border-radius: 4px;
                    font-size: 13px;
                    color: #333;
                }

                .customer-gst {
                    font-size: 13px;
                    color: #333;
                    margin-top: 6px;
                }

                /* Products chart styles */
                .products-list { display:flex; flex-direction:column; gap:8px; margin-top:6px; }
                .product-row { display:flex; align-items:center; gap:8px; }
                .product-name { flex: 0 0 120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; color:#333; }
                .product-bar-wrap { flex:1; background:#f1f1f1; height:10px; border-radius:6px; overflow:hidden; }
                .product-bar { height:100%; background: linear-gradient(90deg,#667eea,#2db7b7); }
                .product-value { flex: 0 0 48px; text-align:right; font-size:12px; color:#333; }
                .renewals-column { display:flex; flex-direction:column; gap:8px; font-size:13px; }
                .renewals-details-list { display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto; }
                .active-renewal-entry { font-size:12px; color:#222; padding:6px; background:#f9f9f9; border-left:2px solid #ffc107; padding-left:8px; border-radius:2px; line-height:1.4; }
                .active-renewal-entry a { color:#667eea; text-decoration:none; }
                .active-renewal-entry a:hover { text-decoration:underline; }
                .active-renewal-entry .muted { color:#666; font-size:11px; }
                }

                .detail-label {
                    font-size: 11px;
                    font-weight: 600;
                    color: #666;
                    text-transform: uppercase;
                }

                .detail-value {
                    font-size: 13px;
                    color: #333;
                    word-break: break-word;
                }
            </style>
        `;

        $(this.wrapper).html(layoutHTML);
        this.attachEventHandlers();
        // hide the explicit Apply button because filters auto-apply
        $('#apply-filters').hide();
        // create debounced apply function
        this.debouncedApplyFilters = this.debounce(() => this.applyFilters(), 600);
        this.populateFilterOptions();
        this.loadReportData();
    }

    attachEventHandlers() {
        $('#refresh-report').on('click', () => this.loadReportData());
        $('#export-report').on('click', () => this.exportReport());
        $('#expand-all-btn').on('click', () => this.expandAll());
        $('#collapse-all-btn').on('click', () => this.collapseAll());
        $('#apply-filters').on('click', () => this.applyFilters());
        $('#reset-filters').on('click', () => this.resetFilters());
        $('#toggle-filters').on('click', () => this.toggleFilterPanel());

        // Auto-apply filters when user changes values (debounced)
        $(document).on('input', '#filter-customer-name', (e) => { e.preventDefault(); this.debouncedApplyFilters(); });
        $(document).on('change', '#filter-sales-person, #filter-created-by, #filter-territory, #filter-industry, #filter-amount-from, #filter-amount-to', (e) => { e.preventDefault(); this.debouncedApplyFilters(); });

        // Pagination handlers
        $(document).on('click', '#prev-page', (e) => { e.preventDefault(); this.prevPage(); });
        $(document).on('click', '#next-page', (e) => { e.preventDefault(); this.nextPage(); });
        $(document).on('change', '#page-size', (e) => { this.setPageSize(parseInt($(e.currentTarget).val(), 10)); });
        // Bottom pagination handlers
        $(document).on('click', '#prev-page-bottom', (e) => { e.preventDefault(); this.prevPage(); });
        $(document).on('click', '#next-page-bottom', (e) => { e.preventDefault(); this.nextPage(); });
        $(document).on('change', '#page-size-bottom', (e) => { this.setPageSize(parseInt($(e.currentTarget).val(), 10)); });

        // Page size pill clicks
        $(document).on('click', '.page-size-pill', (e) => {
            e.preventDefault();
            const size = parseInt($(e.currentTarget).data('size'), 10);
            if (size) this.setPageSize(size);
        });

        // Load more button — increase page size by the base page size (e.g. 20 -> 40 -> 60)
        $(document).on('click', '#load-more-btn', (e) => {
            e.preventDefault();
            const increment = this.basePageSize || this.pageSize || 20;
            const newSize = (this.pageSize || 20) + increment;
            this.setPageSize(newSize);
        });

        // Event delegation for toggle buttons with proper event handling
        $(document).on('click', '.toggle-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const parentId = $(e.currentTarget).data('parent-id');
            if (parentId) {
                this.toggleRow(parentId);
            }
        });

        // Edit contact button handler
        $(document).on('click', '.edit-contact-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const contactName = $(e.currentTarget).data('contact-name');
            if (contactName) {
                frappe.set_route('Form', 'Contact', contactName);
            }
        });





        
// Toggle date range visibility based on Billing Gap
$(document).on('change', '#filter-billing-gap', (e) => {
  const val = $(e.currentTarget).val();

  if (val === 'custom') {
    $('#billing-gap-range').show();
    // Wait for user to pick dates before applying
  } else {
    $('#billing-gap-range').hide();
    $('#billing-gap-from-date').val('');
    $('#billing-gap-to-date').val('');
    // Auto-apply for non-custom
    this.debouncedApplyFilters();
  }
});

// Auto-apply when user sets custom date range
$(document).on('change', '#billing-gap-from-date, #billing-gap-to-date', () => {
  this.debouncedApplyFilters();
});



// Open customer-level report when clicking on customer name
$(document).on('click', '.open-customer-report', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const customer = $(e.currentTarget).data('customer');
  if (!customer) return;

  

  // Choose your preferred navigation — here’s a safe default to a custom page:
  
 // Pass filters that your report expects
  frappe.set_route('query-report', 'Customers Analysis', {
    customer: customer
  });

});







$(document).on('click', '.open-customer-invoices', (e) => {
  e.preventDefault();
  e.stopPropagation();

  const customer = $(e.currentTarget).data('customer');
  if (!customer) return;

  const filters = { customer };
  const win = (typeof this.getSelectedWindow === 'function') ? this.getSelectedWindow() : { from: null, to: null };

  if (win.from && win.to) {
    filters['posting_date'] = ['between', [win.from, win.to]];
  } else if (win.from) {
    filters['posting_date'] = ['>=', win.from];
  } else if (win.to) {
    filters['posting_date'] = ['<=', win.to];
  }

  frappe.set_route('List', 'Sales Invoice', filters);
  window.open(url, '_blank');
  
});












    }

    loadReportData() {
        $('#report-loading').show();
        const container = $('#report-container');
        container.empty();

        // Get filter values
        const customerName = $('#filter-customer-name').val() || '';
        const salesPerson = $('#filter-sales-person').val() || '';
        const createdBy = $('#filter-created-by').val() || '';
        const territory = $('#filter-territory').val() || '';
        const industry = $('#filter-industry').val() || '';
        const minAmount = $('#filter-amount-from').val() || 0;
        const maxAmount = $('#filter-amount-to').val() || 999999999;

        // Build customer filters for server-side query
        const customer_filters = [['Customer', 'disabled', '=', 0]];
        if (customerName) {
            customer_filters.push(['Customer', 'name', 'like', `%${customerName}%`]);
        }
        if (salesPerson) {
            customer_filters.push(['Customer', 'sales_person', '=', salesPerson]);
        }
        if (createdBy) {
            customer_filters.push(['Customer', 'owner', '=', createdBy]);
        }
        if (territory) {
            customer_filters.push(['Customer', 'territory', '=', territory]);
        }
        if (industry) {
            customer_filters.push(['Customer', 'industry', '=', industry]);
        }

        // ---- BILLING GAP FILTER NORMALIZATION ----
let billing_gap_years = null;
let billing_gap_from = null;
let billing_gap_to = null;

const billingSel = $('#filter-billing-gap').val();

if (billingSel === 'custom') {
  billing_gap_from = $('#billing-gap-from-date').val() || null;
  billing_gap_to   = $('#billing-gap-to-date').val() || null;
} else if (billingSel) {
  const years = parseInt(billingSel, 10);
  if (!Number.isNaN(years) && years > 0) {
    billing_gap_years = years;
  }
}

        // Request aggregated customers sorted by sales_amount (server-side)
        const filters_obj = {
            name: customerName,
            sales_person: salesPerson,
            owner: createdBy,
            territory: territory,
            industry: industry
        };

        frappe.call({
            method: 'renewal_module.api.get_customers_with_sales',
            args: {
                filters: filters_obj,
                page: this.currentPage,
                page_size: this.pageSize,
                min_amount: parseFloat(minAmount) || 0,
                max_amount: parseFloat(maxAmount) || 999999999,                
                billing_gap_years,
                billing_gap_from,
                billing_gap_to

            },
            callback: (r) => {
                if (r.message) {
                    // r.message = { customers: [...], total: N }
                    this.sortedCustomers = r.message.customers || [];
                    this.totalCustomers = r.message.total || 0;
                    // populate select options if they are empty
                    this.populateFiltersFromCustomers(this.sortedCustomers);

                    // Populate datalist of customer names matching filters (up to reasonable limit)
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: { doctype: 'Customer', fields: ['name'], filters: customer_filters, limit_page_length: 10000 },
                        callback: (namesRes) => {
                            if (namesRes && namesRes.message) {
                                const list = $('#customer-name-list');
                                list.empty();
                                namesRes.message.forEach(n => list.append(`<option value="${n.name}">`));
                            }
                        }
                    });

                    $('#report-loading').hide();
                    this.renderHierarchicalTable(this.sortedCustomers);
                } else {
                    $('#report-loading').hide();
                    container.html('<div class="alert alert-warning">No data found</div>');
                }
            }
        });
    }

    // Fetch invoices only for the provided customers (current page) and aggregate sales amounts
    fetchSalesDataForCustomers(customers, minAmount = 0, maxAmount = 999999999) {
        const customerNames = customers.map(c => c.name).filter(Boolean);
        if (!customerNames.length) {
            this.sortedCustomers = [];
            $('#report-loading').hide();
            this.renderHierarchicalTable([]);
            return;
        }

        // Fetch invoices only for these customers to reduce load
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                fields: ['name', 'company', 'grand_total', 'customer'],
                filters: [
                    ['Sales Invoice', 'customer', 'in', customerNames],
                    ['Sales Invoice', 'docstatus', '=', 1]
                ],
                limit_page_length: 70000
            },
            callback: (invoices) => {
                const customerSalesMap = {};
                if (invoices.message) {
                    invoices.message.forEach(inv => {
                        if (!customerSalesMap[inv.customer]) {
                            customerSalesMap[inv.customer] = 0;
                        }
                        customerSalesMap[inv.customer] += inv.grand_total || 0;
                    });
                }

                // Attach sales_amount to the page's customers and filter by min/max
                const augmented = customers.map(c => ({ ...c, sales_amount: customerSalesMap[c.name] || 0 }))
                    .filter(c => c.sales_amount >= minAmount && c.sales_amount <= maxAmount)
                    .sort((a, b) => b.sales_amount - a.sales_amount);

                this.sortedCustomers = augmented;

                $('#report-loading').hide();
                this.renderHierarchicalTable(this.sortedCustomers);
            }
        });
    }

    populateFilterOptions() {
        // Populate filter selects from server-side lists so dropdowns show values
        const setDefaultMin = () => {
            const el = $('#filter-amount-from');
            if (el && !el.val()) el.val('0');
        };

        // helper to safely fill a select element
        const fillSelect = (selector, items) => {
            const selectEl = $(selector);
            if (!selectEl || !selectEl.length) return;
            const current = selectEl.val();
            selectEl.empty();
            selectEl.append('<option value="">All</option>');
            items.filter(i => i !== undefined && i !== null && String(i).trim() !== '').forEach(i => {
                const v = String(i);
                selectEl.append(`<option value="${v}">${v}</option>`);
            });
            if (current) selectEl.val(current);
        };

        // Fetch Sales Persons
        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Sales Person', fields: ['name'], limit_page_length: 1000 },
            callback: (r) => {
                if (r.message) {
                    const names = r.message.map(x => x.name).sort();
                    fillSelect('#filter-sales-person', names);
                }
            }
        });

        // Fetch Owners from Customers (distinct)
        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Customer', fields: ['owner'], filters: [['Customer','owner','!=','']], limit_page_length: 10000 },
            callback: (r) => {
                if (r.message) {
                    const owners = Array.from(new Set(r.message.map(x => x.owner))).sort();
                    fillSelect('#filter-created-by', owners);
                }
            }
        });

        // Fetch Territories
        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Territory', fields: ['name'], limit_page_length: 1000 },
            callback: (r) => {
                if (r.message) {
                    const names = r.message.map(x => x.name).sort();
                    fillSelect('#filter-territory', names);
                }
            }
        });

        // Fetch industries from Customer records (distinct)
        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Customer', fields: ['industry'], filters: [['Customer','industry','!=','']], limit_page_length: 10000 },
            callback: (r) => {
                if (r.message) {
                    const industries = Array.from(new Set(r.message.map(x => x.industry))).sort();
                    fillSelect('#filter-industry', industries);
                }
            }
        });

        // set default min amount shortly after
        setTimeout(setDefaultMin, 10);
    }

    populateFiltersFromCustomers(customers) {
        // Populate sales person, created by, territory, industry selects from fetched customers
        const salesSet = new Set();
        const ownerSet = new Set();
        const territorySet = new Set();
        const industrySet = new Set();

        customers.forEach(c => {
            if (c.sales_person) salesSet.add(c.sales_person);
            if (c.owner) ownerSet.add(c.owner);
            if (c.territory) territorySet.add(c.territory);
            if (c.industry) industrySet.add(c.industry);
        });

        const salesSelect = $('#filter-sales-person');
        const createdSelect = $('#filter-created-by');
        const territorySelect = $('#filter-territory');
        const industrySelect = $('#filter-industry');

        // Use existing selects as fallback; preserve current value if any
        const safeFill = (selectEl, items) => {
            if (!selectEl || !selectEl.length) return;
            const current = selectEl.val();
            // If server already populated this select, do not overwrite unless it's empty
            const hasOptions = selectEl.find('option').length > 1;
            if (hasOptions) return;
            selectEl.empty();
            selectEl.append('<option value="">All</option>');
            Array.from(items).sort().filter(i => i !== undefined && i !== null && String(i).trim() !== '').forEach(i => {
                const v = String(i);
                selectEl.append(`<option value="${v}">${v}</option>`);
            });
            if (current) selectEl.val(current);
        };

        safeFill(salesSelect, Array.from(salesSet));
        safeFill(createdSelect, Array.from(ownerSet));
        safeFill(territorySelect, Array.from(territorySet));
        safeFill(industrySelect, Array.from(industrySet));
    }

    renderHierarchicalTable(customersArg) {
        const container = $('#report-container');

        const customers = customersArg || this.sortedCustomers || [];

        if (!customers || customers.length === 0) {
            container.html('<div class="alert alert-info" style="margin:0;padding:20px;">No customers found</div>');
            $('#total-count').text('');
            $('#total-count-bottom').text('');
            $('#page-info').text('Page 0');
            $('#page-info-bottom').text('Page 0');
            return;
        }

        // Pagination calculation
        const total = (this.totalCustomers && this.totalCustomers > 0) ? this.totalCustomers : customers.length;
        const pageSize = this.pageSize || 20;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        // If server already returned only the page's customers (customersArg present), use them directly.
        let pageCustomers = [];
        if (customersArg && customersArg.length) {
            pageCustomers = customers;
        } else {
            const start = (this.currentPage - 1) * pageSize;
            const end = start + pageSize;
            pageCustomers = customers.slice(start, end);
        }

        const showingCount = pageCustomers.length;
        $('#total-count').text(`Showing: ${showingCount} | Total: ${total}`);
        $('#page-info').text(`Page ${this.currentPage} of ${totalPages}`);
        // keep bottom footer in sync (if present)
        const bottomPageInfo = $('#page-info-bottom');
        const bottomTotal = $('#total-count-bottom');
        if (bottomPageInfo && bottomPageInfo.length) bottomPageInfo.text(`Page ${this.currentPage} of ${totalPages}`);
        if (bottomTotal && bottomTotal.length) bottomTotal.text(`Showing: ${showingCount} | Total: ${total}`);

        // update active pill
        $('.page-size-pill').removeClass('active');
        $(`.page-size-pill[data-size="${this.pageSize}"]`).addClass('active');

        let html = `
            <table class="hierarchy-table">
                <thead>
                    <tr>
                        <th style="width: 40px;"></th>
                        <th style="width: 240px;">Customer</th>
                        <th style="width: 160px;">Sales Person</th>
                        <th style="width: 120px;">Territory</th>
                        <th style="width: 120px;">Industry</th>
                        <th style="width: 100px;">Employees</th>
                        <th style="width: 130px;">Sales Amount</th>
                        <th style="width: 120px;">Created By</th>
                        
                        
                        <th style="width: 130px;">Renewal Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const start = (this.currentPage - 1) * pageSize;
        pageCustomers.forEach((customer, idx) => {
            // Use absolute index for stable IDs
            const absoluteIndex = start + idx;
            const customerId = `customer_${absoluteIndex}`;

            html += `
                <tr class="parent-row" data-customer-id="${customerId}">
                    <td>
                        <button class="toggle-btn" data-parent-id="${customerId}" type="button">
                            <i class="octicon octicon-chevron-right"></i>
                        </button>
                    </td>
                        
 <td>
  <a href="#" class="open-customer-report"
      data-customer="${customer.name}"
      title="Open customer summary">
     <strong>${customer.customer_name || customer.name}</strong>
   </a>
 </td>

                        <td>${customer.sales_person || '-'}</td>
                        <td>${customer.territory || '-'}</td>
                        <td>${customer.industry || '-'}</td>
                        <td>${customer.employees || customer.employees || '-'}</td>
                        <td><span class="sales-amount" data-customer="${customer.name}">${this.formatCurrency(customer.sales_amount)}</span></td>
                        
                        <td>${customer.owner || '-'}</td>
                        
                        
                        <td><span class="renewal-amount" data-customer="${customer.name}">-</span></td>
                </tr>
            `;

            // Child Rows - Contacts, Address, Products, Active Renewals
            html += `
                <tr class="child-row child-details" data-parent-id="${customerId}">
                    <td></td>
                    <td colspan="8">
                        <div class="details-columns" style="display:flex; gap:16px;">
                            <div class="contacts-column" style="flex:1; min-width:180px;">
                                <strong style="margin-right: 12px; display:block; margin-bottom:6px;">👤 Contacts</strong>
                                <div class="contacts-list">Loading...</div>
                            </div>
                            <div class="address-column" style="width:280px; flex-shrink:0;">
                                <strong style="margin-right: 12px; display:block; margin-bottom:6px;">📍 Address</strong>
                                <div class="address-list">Loading...</div>
                                <div class="customer-gst" style="margin-top:8px;"><strong>GST:</strong> <span class="gst-value">Loading...</span></div>
                            </div>
                            <div class="products-column" style="width:280px; flex-shrink:0;">
                                
<a href="#" class="open-customer-invoices" data-customer="${customer.name}">
  <strong style="margin-right: 12px; display:block; margin-bottom:6px;">📊 Products</strong>
</a>

                                <div class="products-list">Loading...</div>
                            </div>
                            <div class="renewals-column" style="width:280px; flex-shrink:0;">
                                <strong style="margin-right: 12px; display:block; margin-bottom:6px;">🔄 Active Renewals</strong>
                                <div class="renewals-details-list">Loading...</div>
                            </div>
                        </div>
                    </td>
                </tr>

                
            `;

          

            // Child data will be loaded on demand when the row is expanded
        });

        html += `
                </tbody>
            </table>
        `;

        container.html(html);
    }

//     loadChildData(customerName, customerId) {
//         // Load contacts (do not request fields that are not permitted in get_list)
//         frappe.call({
//             method: 'frappe.client.get_list',
//                 args: {
//                 doctype: 'Contact',
//                 // request only commonly allowed fields
//                 fields: ['name', 'first_name', 'email_id', 'mobile_no', 'phone'],
//                 filters: [
//                     ['Dynamic Link', 'link_doctype', '=', 'Customer'],
//                     ['Dynamic Link', 'link_name', '=', customerName]
//                 ]
//             },
//             callback: (r) => {
//                 if (r.message && r.message.length > 0) {
//                     const contactsHtml = r.message.map(c => {
//                         const contactName = c.first_name || c.name || '-';
//                         const mobileVal = (c.mobile_no && c.mobile_no.trim()) ? c.mobile_no : '';
//                         const phoneVal = (c.phone && c.phone.trim()) ? c.phone : '';
//                         const emailVal = (c.email_id && c.email_id.trim()) ? c.email_id : '';

//                         // If numbers are identical, show only one; otherwise show both
//                         const isSameNumber = mobileVal && phoneVal && mobileVal === phoneVal;
//                         const phoneNumberHtml = (() => {
//                             if (isSameNumber) {
//                                 // Show once with generic phone icon
//                                 return `<a class="contact-link" href="tel:${mobileVal}" title="Phone"><i class="fa fa-phone contact-icon" aria-hidden="true"></i> ${mobileVal}</a>`;
//                             } else if (mobileVal && phoneVal) {
//                                 // Show both
//                                 return `<a class="contact-link" href="tel:${mobileVal}" title="Mobile"><i class="fa fa-mobile contact-icon" aria-hidden="true" style="font-size:14px;"></i> ${mobileVal}</a>
//                                 <a class="contact-link" href="tel:${phoneVal}" title="Phone"><i class="fa fa-phone contact-icon" aria-hidden="true"></i> ${phoneVal}</a>`;
//                             } else if (mobileVal) {
//                                 // Only mobile
//                                 return `<a class="contact-link" href="tel:${mobileVal}" title="Mobile"><i class="fa fa-mobile contact-icon" aria-hidden="true" style="font-size:14px;"></i> ${mobileVal}</a>`;
//                             } else if (phoneVal) {
//                                 // Only phone
//                                 return `<a class="contact-link" href="tel:${phoneVal}" title="Phone"><i class="fa fa-phone contact-icon" aria-hidden="true"></i> ${phoneVal}</a>`;
//                             } else {
//                                 // Neither
//                                 return `<span class="contact-empty">-</span>`;
//                             }
//                         })();

//                         const emailHtml = emailVal ? `<a class="contact-link" href="mailto:${emailVal}" title="Email"><i class="fa fa-envelope contact-icon" aria-hidden="true"></i> ${emailVal}</a>` : `<span class="contact-empty">-</span>`;

//                         return `
//                             <div class="contact-row-compact" data-contact-name="${c.name}">
//                                 <div class="contact-left">
//                                     <div class="contact-name-compact">${contactName}</div>
//                                     ${phoneNumberHtml}
//                                     ${emailHtml}
//                                 </div>
//                                 <div class="contact-right">
//                                     <button class="btn btn-sm btn-default edit-contact-btn" data-contact-name="${c.name}" title="Edit Contact">
//                                         <i class="fa fa-edit"></i>
//                                     </button>
//                                 </div>
//                             </div>
//                         `;
//                     }).join('');

//                     $(`.child-details[data-parent-id="${customerId}"] .contacts-column .contacts-list`).html(`<div class="contacts-list-view">${contactsHtml}</div>`);

//                     // Fetch one address linked to the customer (if any) and show it
//                     frappe.call({
//                         method: 'frappe.client.get_list',
//                         args: {
//                             doctype: 'Address',
//                             fields: ['name','address_line1', 'address_line2', 'city', 'state', 'pincode', 'address_type'],
//                             filters: [
//                                 ['Dynamic Link', 'link_doctype', '=', 'Customer'],
//                                 ['Dynamic Link', 'link_name', '=', customerName]
//                             ],
//                             limit_page_length: 20
//                         },
//                         callback: (addrRes) => {
//                             let addrHtml = 'No address';
//                             if (addrRes && addrRes.message && addrRes.message.length > 0) {
//                                 addrHtml = addrRes.message.map(a => {
//                                     const parts = [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
//                                     return `<div class="address-entry"><strong>${a.address_type || a.name}:</strong> ${parts}</div>`;
//                                 }).join('');
//                             }
//                             $(`.child-details[data-parent-id="${customerId}"] .address-column .address-list`).html(addrHtml);
//                         }
//                     });

//                     // Fetch Customer doc to get GST number (if stored on Customer)
//                     frappe.call({
//                         method: 'frappe.client.get',
//                         args: { doctype: 'Customer', name: customerName },
//                         callback: (custRes) => {
//                             let gstVal = '-';
//                             if (custRes && custRes.message) {
//                                 gstVal = custRes.message.gstin || custRes.message.gst_number || '-';
//                             }
//                             $(`.child-details[data-parent-id="${customerId}"] .address-column .gst-value`).text(gstVal || '-');
//                         }
//                     });

//                 } else {
//                     $(`.child-details[data-parent-id="${customerId}"] .contacts-column .contacts-list`).html('No contacts');
//                 }
//             }
//         });

//         // Load invoices - with proper aggregation
//         frappe.call({
//             method: 'frappe.client.get_list',
//             args: {
//                 doctype: 'Sales Invoice',
//                 fields: ['name', 'company', 'grand_total', 'customer'],
//                 filters: [
//                     ['Sales Invoice', 'customer', '=', customerName],
//                     ['Sales Invoice', 'docstatus', '=', 1]
//                 ],
//                 limit_page_length: 500
//             },
//             callback: (r) => {
//                 if (r.message && r.message.length > 0) {
//                     const invoiceMap = {};
//                     let totalAmount = 0;
                    
//                     // Group by company
//                     r.message.forEach(inv => {
//                         if (!invoiceMap[inv.company]) {
//                             invoiceMap[inv.company] = { count: 0, amount: 0 };
//                         }
//                         invoiceMap[inv.company].count++;
//                         invoiceMap[inv.company].amount += inv.grand_total || 0;
//                         totalAmount += inv.grand_total || 0;
//                     });

//                     const invoiceHtml = Object.keys(invoiceMap).map(company => {
//                         const inv = invoiceMap[company];
//                         return `<span style="display:inline-block; margin-right:10px; padding:4px 8px; background:#e8f5e9; border-radius:3px; font-size:11px;"><strong>${company}</strong>: ${inv.count} invoices - ${this.formatCurrency(inv.amount)}</span>`;
//                     }).join('');
                    
//                     $(`.child-invoice[data-parent-id="${customerId}"] .invoices-list`).html(invoiceHtml);
//                     $(`.invoice-count[data-customer="${customerName}"]`).html(r.message.length);
//                     const salesHtml = this.formatCurrency(totalAmount);
//                     const $salesEl = $(`.sales-amount[data-customer="${customerName}"]`);
//                     $salesEl.html(salesHtml);
//                     $salesEl.removeClass('amount-positive amount-warning amount-zero amount-negative');
//                     if (totalAmount > 0) {
//                         $salesEl.addClass('amount-positive');
//                     } else if (totalAmount < 0) {
//                         $salesEl.addClass('amount-negative');
//                     } else {
//                         $salesEl.addClass('amount-zero');
//                     }

//                     // --- Products bar chart for this customer's invoices ---
//                     // Use server-side aggregation to fetch top products for this customer
//                     frappe.call({
//                         method: 'renewal_module.api.get_products_for_customer',
//                         args: { customer_name: customerName, top_n: 8 },
//                         callback: (itemsRes) => {
//                             if (itemsRes.message && itemsRes.message.length) {
//                                 const rows = itemsRes.message;
//                                 const maxQty = Math.max(...rows.map(r => parseFloat(r.total_qty || 0)), 1);
//                                 const productHtml = rows.map(r => {
//                                     const name = r.item_name || r.item_code || 'Unknown';
//                                     const qty = parseFloat(r.total_qty || 0) || 0;
//                                     const width = Math.round((qty / maxQty) * 100);
//                                     return `<div class="product-row"><div class="product-name" title="${name}">${name}</div><div class="product-bar-wrap"><div class="product-bar" style="width:${width}%"></div></div><div class="product-value">${qty}</div></div>`;
//                                 }).slice(0,8).join('');
//                                 $(`.child-details[data-parent-id="${customerId}"] .products-list`).html(productHtml);
//                             } else {
//                                 $(`.child-details[data-parent-id="${customerId}"] .products-list`).html('No products');
//                             }
//                         },
//                         error: (err) => {
//                             $(`.child-details[data-parent-id="${customerId}"] .products-list`).html('No products');
//                         }
//                     });
//                 } else {
//                     $(`.child-invoice[data-parent-id="${customerId}"] .invoices-list`).html('No invoices');
//                     $(`.invoice-count[data-customer="${customerName}"]`).html('0');
//                     const $salesEl = $(`.sales-amount[data-customer="${customerName}"]`);
//                     $salesEl.html('₹0');
//                     $salesEl.removeClass('amount-positive amount-warning amount-zero amount-negative').addClass('amount-zero');
//                     $(`.child-details[data-parent-id="${customerId}"] .products-list`).html('No products');
//                 }
//             }
//         });

//         // Load renewals - with proper aggregation
//         frappe.call({
//             method: 'frappe.client.get_list',
//             args: {
//                 doctype: 'Renewal List',
//                 fields: ['name', 'company', 'total_amount', 'customer_name', 'product_name', 'total_quantity', 'start_date', 'end_date', 'status'],
//                 filters: [['Renewal List', 'customer_name', '=', customerName,'status','=', 'Active']],
//                 limit_page_length: 500
//             },
//             callback: (r) => {
//                 if (r.message && r.message.length > 0) {
//                     const renewalMap = {};
//                     let totalAmount = 0;
                    
//                     // Group by company
//                     r.message.forEach(ren => {
//                         if (!renewalMap[ren.company]) {
//                             renewalMap[ren.company] = { count: 0, amount: 0 };
//                         }
//                         renewalMap[ren.company].count++;
//                         renewalMap[ren.company].amount += ren.total_amount || 0;
//                         totalAmount += ren.total_amount || 0;
//                     });

//                     const renewalHtml = Object.keys(renewalMap).map(company => {
//                         const ren = renewalMap[company];
//                         return `<span style="display:inline-block; margin-right:10px; padding:4px 8px; background:#fff3cd; border-radius:3px; font-size:11px;"><strong>${company}</strong>: ${ren.count} renewals - ${this.formatCurrency(ren.amount)}</span>`;
//                     }).join('');
                    
//                     $(`.child-renewal[data-parent-id="${customerId}"] .renewals-list`).html(renewalHtml);
//                     // Render active renewal details in the dedicated renewals column
//                     try {
//                         const activeRenewals = r.message.filter(x => x.status && String(x.status).toLowerCase() === 'active');
//                         if (activeRenewals && activeRenewals.length) {
//                             const activeHtml = activeRenewals.map(ar => {
//                                 const prod = ar.product_name || ar.product || ar.item || '-';
//                                 const qty = ar.total_quantity || ar.total_amount || '-';
//                                 const start = ar.start_date || '-';
//                                 const end = ar.end_date || '-';
//                                 return `<div class="active-renewal-entry"><a href="#Form/Renewal List/${ar.name}" target="_blank"><strong>${prod}</strong></a> <br/> <span class="muted">(${qty})</span> <br/> <small>${start} → ${end}</small></div>`;
//                             }).join('');
//                             $(`.child-details[data-parent-id="${customerId}"] .renewals-details-list`).html(activeHtml);
//                         } else {
//                             $(`.child-details[data-parent-id="${customerId}"] .renewals-details-list`).html('No active renewals');
//                         }
//                     } catch (e) { console.error('render active renewals', e); $(`.child-details[data-parent-id="${customerId}"] .renewals-details-list`).html('Error'); }
//                     $(`.renewal-count[data-customer="${customerName}"]`).html(r.message.length);
//                     const renewalHtmlFormatted = this.formatCurrency(totalAmount);
//                     const $renewalEl = $(`.renewal-amount[data-customer="${customerName}"]`);
//                     $renewalEl.html(renewalHtmlFormatted);
//                     $renewalEl.removeClass('amount-positive amount-warning amount-zero amount-negative');
//                     if (totalAmount > 0) {
//                         // Use warning color for renewal totals
//                         $renewalEl.addClass('amount-warning');
//                     } else if (totalAmount < 0) {
//                         $renewalEl.addClass('amount-negative');
//                     } else {
//                         $renewalEl.addClass('amount-zero');
//                     }
//                 } else {
//                     $(`.child-renewal[data-parent-id="${customerId}"] .renewals-list`).html('No renewals');
//                     $(`.renewal-count[data-customer="${customerName}"]`).html('0');
//                     const $renewalEl = $(`.renewal-amount[data-customer="${customerName}"]`);
//                     $renewalEl.html('₹0');
//                     $renewalEl.removeClass('amount-positive amount-warning amount-zero amount-negative').addClass('amount-zero');
//                 }
//             }
//         });
//     }

// //     Returns the currently-selected window as { from: 'YYYY-MM-DD' | null, to: 'YYYY-MM-DD' | null }
// // FY is India FY: Apr 1 – Mar 31



getSelectedWindow() {
    const fmt = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const sel = $('#filter-billing-gap').val();

    // Custom range
    if (sel === 'custom') {
        const from = $('#billing-gap-from-date').val() || null;
        const to   = $('#billing-gap-to-date').val() || null;
        return { from, to };
    }

    // FY N years ago
    if (sel) {
        const n = parseInt(sel, 10);
        if (!Number.isNaN(n) && n > 0) {
            const today = new Date();
            // Apr is month index 3 in JS
            const fyStartMonth = 3; // April (0-based)
            const fyStartDay = 1;

            // current FY start
            let currFyStart = new Date(today.getFullYear(), fyStartMonth, fyStartDay);
            if (today < currFyStart) {
                currFyStart = new Date(today.getFullYear() - 1, fyStartMonth, fyStartDay);
            }

            const targetStart = new Date(currFyStart.getFullYear() - n, fyStartMonth, fyStartDay);
            const nextStart   = new Date(currFyStart.getFullYear() - (n - 1), fyStartMonth, fyStartDay);
            const targetEnd   = new Date(nextStart.getTime() - 24 * 3600 * 1000); // day before next FY start

            return { from: fmt(targetStart), to: fmt(targetEnd) };
        }
    }

    // No gap filter
    return { from: null, to: null };
}


loadChildData(customerName, customerId) {
    // ... Contacts + Address + GST logic stays the same ...

    // Load contacts (do not request fields that are not permitted in get_list)
        frappe.call({
            method: 'frappe.client.get_list',
                args: {
                doctype: 'Contact',
                // request only commonly allowed fields
                fields: ['name', 'first_name', 'email_id', 'mobile_no', 'phone'],
                filters: [
                    ['Dynamic Link', 'link_doctype', '=', 'Customer'],
                    ['Dynamic Link', 'link_name', '=', customerName]
                ]
            },
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    const contactsHtml = r.message.map(c => {
                        const contactName = c.first_name || c.name || '-';
                        const mobileVal = (c.mobile_no && c.mobile_no.trim()) ? c.mobile_no : '';
                        const phoneVal = (c.phone && c.phone.trim()) ? c.phone : '';
                        const emailVal = (c.email_id && c.email_id.trim()) ? c.email_id : '';

                        // If numbers are identical, show only one; otherwise show both
                        const isSameNumber = mobileVal && phoneVal && mobileVal === phoneVal;
                        const phoneNumberHtml = (() => {
                            if (isSameNumber) {
                                // Show once with generic phone icon
                                return `<a class="contact-link" href="tel:${mobileVal}" title="Phone"><i class="fa fa-phone contact-icon" aria-hidden="true"></i> ${mobileVal}</a>`;
                            } else if (mobileVal && phoneVal) {
                                // Show both
                                return `<a class="contact-link" href="tel:${mobileVal}" title="Mobile"><i class="fa fa-mobile contact-icon" aria-hidden="true" style="font-size:14px;"></i> ${mobileVal}</a>
                                <a class="contact-link" href="tel:${phoneVal}" title="Phone"><i class="fa fa-phone contact-icon" aria-hidden="true"></i> ${phoneVal}</a>`;
                            } else if (mobileVal) {
                                // Only mobile
                                return `<a class="contact-link" href="tel:${mobileVal}" title="Mobile"><i class="fa fa-mobile contact-icon" aria-hidden="true" style="font-size:14px;"></i> ${mobileVal}</a>`;
                            } else if (phoneVal) {
                                // Only phone
                                return `<a class="contact-link" href="tel:${phoneVal}" title="Phone"><i class="fa fa-phone contact-icon" aria-hidden="true"></i> ${phoneVal}</a>`;
                            } else {
                                // Neither
                                return `<span class="contact-empty">-</span>`;
                            }
                        })();

                        const emailHtml = emailVal ? `<a class="contact-link" href="mailto:${emailVal}" title="Email"><i class="fa fa-envelope contact-icon" aria-hidden="true"></i> ${emailVal}</a>` : `<span class="contact-empty">-</span>`;

                        return `
                            <div class="contact-row-compact" data-contact-name="${c.name}">
                                <div class="contact-left">
                                    <div class="contact-name-compact">${contactName}</div>
                                    ${phoneNumberHtml}
                                    ${emailHtml}
                                </div>
                                <div class="contact-right">
                                    <button class="btn btn-sm btn-default edit-contact-btn" data-contact-name="${c.name}" title="Edit Contact">
                                        <i class="fa fa-edit"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');

                    $(`.child-details[data-parent-id="${customerId}"] .contacts-column .contacts-list`).html(`<div class="contacts-list-view">${contactsHtml}</div>`);

                    // Fetch one address linked to the customer (if any) and show it
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Address',
                            fields: ['name','address_line1', 'address_line2', 'city', 'state', 'pincode', 'address_type'],
                            filters: [
                                ['Dynamic Link', 'link_doctype', '=', 'Customer'],
                                ['Dynamic Link', 'link_name', '=', customerName]
                            ],
                            limit_page_length: 20
                        },
                        callback: (addrRes) => {
                            let addrHtml = 'No address';
                            if (addrRes && addrRes.message && addrRes.message.length > 0) {
                                addrHtml = addrRes.message.map(a => {
                                    const parts = [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
                                    return `<div class="address-entry"><strong>${a.address_type || a.name}:</strong> ${parts}</div>`;
                                }).join('');
                            }
                            $(`.child-details[data-parent-id="${customerId}"] .address-column .address-list`).html(addrHtml);
                        }
                    });

                    // Fetch Customer doc to get GST number (if stored on Customer)
                    frappe.call({
                        method: 'frappe.client.get',
                        args: { doctype: 'Customer', name: customerName },
                        callback: (custRes) => {
                            let gstVal = '-';
                            if (custRes && custRes.message) {
                                gstVal = custRes.message.gstin || custRes.message.gst_number || '-';
                            }
                            $(`.child-details[data-parent-id="${customerId}"] .address-column .gst-value`).text(gstVal || '-');
                        }
                    });

                } else {
                    $(`.child-details[data-parent-id="${customerId}"] .contacts-column .contacts-list`).html('No contacts');
                }
            }
        });

    // ------- Date window from Billing Gap -------
    const win = this.getSelectedWindow();

    // ------- INVOICES (period-limited) -------
    const invFilters = [
        ['Sales Invoice', 'customer', '=', customerName],
        ['Sales Invoice', 'docstatus', '=', 1],
    ];
    if (win.from) invFilters.push(['Sales Invoice', 'posting_date', '>=', win.from]);
    if (win.to)   invFilters.push(['Sales Invoice', 'posting_date', '<=', win.to]);

    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Sales Invoice',
            fields: ['name', 'company', 'net_total', 'grand_total', 'posting_date', 'customer'],
            filters: invFilters,
            limit_page_length: 500
        },
        callback: (r) => {
            if (r.message && r.message.length > 0) {
                const invoiceMap = {};
                let periodTotal = 0;

                r.message.forEach(inv => {
                    const amt = (typeof inv.net_total === 'number' ? inv.net_total : inv.grand_total) || 0;
                    if (!invoiceMap[inv.company]) invoiceMap[inv.company] = { count: 0, amount: 0 };
                    invoiceMap[inv.company].count++;
                    invoiceMap[inv.company].amount += amt;
                    periodTotal += amt;
                });

                // Render a small "Invoices" line in the contacts column footer or create a mini section.
                const invoiceHtml = Object.keys(invoiceMap).map(company => {
                    const v = invoiceMap[company];
                    return `<span style="display:inline-block; margin-right:10px; padding:4px 8px; background:#e8f5e9; border-radius:3px; font-size:11px;">
                              <strong>${company}</strong>: ${v.count} invoices - ${this.formatCurrency(v.amount)}
                            </span>`;
                }).join('');

                // Add an "Invoices" strip under the contacts list (or wherever you prefer)
                // $(`.child-details[data-parent-id="${customerId}"] .contacts-column .contacts-list`)
                //   .append(`<div style="margin-top:8px;"><strong>🧾 Invoices (Selected Period)</strong><div>${invoiceHtml || '—'}</div></div>`);

                // IMPORTANT: Don’t overwrite the parent .sales-amount unless you really want to.
                // It already shows the server’s period-limited amount. If you want it synced,
                // make sure this total uses the same window (which it does now), then:
                // const $salesEl = $(`.sales-amount[data-customer="${customerName}"]`);
                // $salesEl.text(this.formatCurrency(periodTotal))
                //         .removeClass('amount-positive amount-warning amount-zero amount-negative')
                //         .addClass(periodTotal > 0 ? 'amount-positive' : (periodTotal < 0 ? 'amount-negative' : 'amount-zero'));
            } else {
                $(`.child-details[data-parent-id="${customerId}"] .contacts-column .contacts-list`)
                  .append(`<div style="margin-top:8px;"><strong>🧾 Invoices (Selected Period)</strong><div>—</div></div>`);
            }
        }
    });

    // ------- PRODUCTS (period-limited) -------
    frappe.call({
        method: 'renewal_module.api.get_products_for_customer',
        args: {
            customer_name: customerName,
            top_n: 8,
            date_from: win.from || null,
            date_to: win.to || null
        },
        callback: (itemsRes) => {
            if (itemsRes.message && itemsRes.message.length) {
                const rows = itemsRes.message;
                const maxQty = Math.max(...rows.map(r => parseFloat(r.total_qty || 0)), 1);
                const productHtml = rows.slice(0,8).map(r => {
                    const name = r.item_name || r.item_code || 'Unknown';
                    const qty = parseFloat(r.total_qty || 0) || 0;
                    const width = Math.round((qty / maxQty) * 100);
                    return `<div class="product-row">
                                <div class="product-name" title="${name}">${name}</div>
                                <div class="product-bar-wrap"><div class="product-bar" style="width:${width}%"></div></div>
                                <div class="product-value">${qty}</div>
                            </div>`;
                }).join('');
                $(`.child-details[data-parent-id="${customerId}"] .products-list`).html(productHtml);
            } else {
                $(`.child-details[data-parent-id="${customerId}"] .products-list`).html('No products');
            }
        },
        error: () => {
            $(`.child-details[data-parent-id="${customerId}"] .products-list`).html('No products');
        }
    });

    // ------- RENEWALS (period-limited) -------
    frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Renewal List',
                fields: ['name', 'company', 'total_amount', 'customer_name', 'product_name', 'total_quantity', 'start_date', 'end_date', 'status'],
                filters: [['Renewal List', 'customer_name', '=', customerName,'status','=', 'Active']],
                order_by: 'end_date desc',   // 👈 SORTING HERE
                limit_page_length: 500
            },
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    const renewalMap = {};
                    let totalAmount = 0;
                    
                    // Group by company
                    r.message.forEach(ren => {
                        if (!renewalMap[ren.company]) {
                            renewalMap[ren.company] = { count: 0, amount: 0 };
                        }
                        renewalMap[ren.company].count++;
                        renewalMap[ren.company].amount += ren.total_amount || 0;
                        totalAmount += ren.total_amount || 0;
                    });

                    const renewalHtml = Object.keys(renewalMap).map(company => {
                        const ren = renewalMap[company];
                        return `<span style="display:inline-block; margin-right:10px; padding:4px 8px; background:#fff3cd; border-radius:3px; font-size:11px;"><strong>${company}</strong>: ${ren.count} renewals - ${this.formatCurrency(ren.amount)}</span>`;
                    }).join('');
                    
                    $(`.child-renewal[data-parent-id="${customerId}"] .renewals-list`).html(renewalHtml);
                    // Render active renewal details in the dedicated renewals column
                    try {
                        const activeRenewals = r.message.filter(x => x.status && String(x.status).toLowerCase() === 'active');
                        if (activeRenewals && activeRenewals.length) {
                            const activeHtml = activeRenewals.map(ar => {
                                const prod = ar.product_name || ar.product || ar.item || '-';
                                const qty = ar.total_quantity || ar.total_amount || '-';
                                const start = ar.start_date || '-';
                                const end = ar.end_date || '-';
                                return `<div class="active-renewal-entry"><a href="#Form/Renewal List/${ar.name}" target="_blank"><strong>${prod}</strong></a> <br/> <span class="muted">(${qty})</span> <br/> <small>${start} → ${end}</small></div>`;
                            }).join('');
                            $(`.child-details[data-parent-id="${customerId}"] .renewals-details-list`).html(activeHtml);
                        } else {
                            $(`.child-details[data-parent-id="${customerId}"] .renewals-details-list`).html('No active renewals');
                        }
                    } catch (e) { console.error('render active renewals', e); $(`.child-details[data-parent-id="${customerId}"] .renewals-details-list`).html('Error'); }
                    $(`.renewal-count[data-customer="${customerName}"]`).html(r.message.length);
                    const renewalHtmlFormatted = this.formatCurrency(totalAmount);
                    const $renewalEl = $(`.renewal-amount[data-customer="${customerName}"]`);
                    $renewalEl.html(renewalHtmlFormatted);
                    $renewalEl.removeClass('amount-positive amount-warning amount-zero amount-negative');
                    if (totalAmount > 0) {
                        // Use warning color for renewal totals
                        $renewalEl.addClass('amount-warning');
                    } else if (totalAmount < 0) {
                        $renewalEl.addClass('amount-negative');
                    } else {
                        $renewalEl.addClass('amount-zero');
                    }
                } else {
                    $(`.child-renewal[data-parent-id="${customerId}"] .renewals-list`).html('No renewals');
                    $(`.renewal-count[data-customer="${customerName}"]`).html('0');
                    const $renewalEl = $(`.renewal-amount[data-customer="${customerName}"]`);
                    $renewalEl.html('₹0');
                    $renewalEl.removeClass('amount-positive amount-warning amount-zero amount-negative').addClass('amount-zero');
                }
            }
        });
}










    toggleRow(parentId) {
        const childRows = $(`.child-row[data-parent-id="${parentId}"]`);
        const btn = $(`.toggle-btn[data-parent-id="${parentId}"]`);

        // Check current state
        const isExpanded = this.expandedRows.has(parentId);
        
        if (isExpanded) {
            // Collapse
            childRows.removeClass('show');
            btn.removeClass('expanded');
            btn.html('<i class="octicon octicon-chevron-right"></i>');
            this.expandedRows.delete(parentId);
        } else {
            // Expand
            childRows.addClass('show');
            btn.addClass('expanded');
            btn.html('<i class="octicon octicon-chevron-right"></i>');
            this.expandedRows.add(parentId);
            // Load child data on first expand to avoid heavy upfront loading
            try {
                const loaded = childRows.attr('data-loaded');
                if (!loaded || loaded !== '1') {
                    // mark as loading to prevent duplicate requests
                    childRows.attr('data-loaded', 'loading');
                    // find the customer name from the parent row's data attribute
                    const customerName = $(`.parent-row[data-customer-id="${parentId}"]`).find('.sales-amount').data('customer');
                    if (customerName) {
                        this.loadChildData(customerName, parentId);
                    } else {
                        // nothing found, mark as loaded to avoid retry storms
                        childRows.attr('data-loaded', '1');
                    }
                }
            } catch (e) {
                console.error('Error loading child data on expand', e);
            }
        }
    }

    expandAll() {
        $('.toggle-btn').each((idx, btn) => {
            const parentId = $(btn).data('parent-id');
            if (parentId && !this.expandedRows.has(parentId)) {
                this.toggleRow(parentId);
            }
        });
    }

    collapseAll() {
        $('.toggle-btn').each((idx, btn) => {
            const parentId = $(btn).data('parent-id');
            if (parentId && this.expandedRows.has(parentId)) {
                this.toggleRow(parentId);
            }
        });
    }

    applyFilters() {
        this.loadReportData();
    }

    resetFilters() {
        $('#filter-customer-name').val('');
        $('#filter-sales-person').val('');
        $('#filter-created-by').val('');
        $('#filter-territory').val('');
        $('#filter-industry').val('');
        $('#filter-amount-from').val('');
        $('#filter-amount-to').val('');


        
$('#filter-billing-gap').val('');
  $('#billing-gap-from-date').val('');
  $('#billing-gap-to-date').val('');
  $('#billing-gap-range').hide();

  
        this.loadReportData();
    }

    toggleFilterPanel() {
        const btn = $('#toggle-filters');
        const content = $('.filter-content');
        
        if (content.is(':visible')) {
            content.slideUp(200);
            btn.html('Show');
        } else {
            content.slideDown(200);
            btn.html('Hide');
        }
    }

    // Pagination helpers
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage -= 1;
            this.loadReportData();
            $(window).scrollTop(0);
        }
    }

    nextPage() {
        const total = (this.totalCustomers && this.totalCustomers > 0) ? this.totalCustomers : (this.sortedCustomers || []).length;
        const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
        if (this.currentPage < totalPages) {
            this.currentPage += 1;
            this.loadReportData();
            $(window).scrollTop(0);
        }
    }

    setPageSize(size) {
        this.pageSize = size || 20;
        // Make load-more increment follow the currently selected page size
        this.basePageSize = this.pageSize;
        this.currentPage = 1;
        // sync both page size selectors if present
        const top = $('#page-size');
        const bottom = $('#page-size-bottom');
        if (top && top.length) top.val(String(this.pageSize));
        if (bottom && bottom.length) bottom.val(String(this.pageSize));
        this.loadReportData();
    }

    exportReport() {
        frappe.msgprint({
            title: 'Export Report',
            message: 'Export functionality is being developed. Please use the standard Report export feature.'
        });
    }

    render() {
        this.loadReportData();
    }
}
