// File: renewal_module/custom_module/page/opportunity_list/opportunity_list.js

frappe.provide("renewal_module.ui");

/**
 * CONFIG: Backend API endpoints.
 * Update these to point to your app if they differ.
 */
const OPPORTUNITY_API = {
  list: "renewal_module.custom_module.page.opportunity_list.opportunity_list.get_opportunity_list",
  detail: "renewal_module.custom_module.page.opportunity_list.opportunity_list.get_opportunity_details",
  activity_list: "renewal_module.custom_module.page.opportunity_list.opportunity_list.get_activity",
  activity_create: "renewal_module.custom_module.page.opportunity_list.opportunity_list.create_activity",
};

/**
 * Single on_page_load handler:
 * - Ensures support layout is loaded
 * - Mounts our UI into #support-page-content
 */
frappe.pages["opportunity-list"].on_page_load = function (wrapper) {
  const page_wrapper = $(wrapper).find(".layout-main-section")[0] || wrapper;

  const ensureSupportLayoutLoaded = (cb) => {
    if (typeof loadSupportLayout === "function") return cb();
    frappe.require(
      ["/assets/renewal_module/js/issue_themes/support_layout2.js"],
      () => {
        frappe.require([
          "/assets/renewal_module/css/issue_themes/support_theme2.css",
        ]);
        setTimeout(cb, 10);
      }
    );
  };

  ensureSupportLayoutLoaded(() => {
    loadSupportLayout(page_wrapper, () => {
      if (!wrapper.__opportunityListPage) {
        wrapper.__opportunityListPage = new renewal_module.ui.OpportunityListPage(
          page_wrapper
        );
      }
      wrapper.__opportunityListPage.render();
    });
  });
};

frappe.pages["opportunity-list"].on_page_show = function (wrapper) {
  if (wrapper && wrapper.__opportunityListPage) {
    wrapper.__opportunityListPage.handleRoute();
  }
};

// -------------------- PAGE CLASS --------------------
renewal_module.ui.OpportunityListPage = class OpportunityListPage {
  constructor(wrapper) {
    this.wrapper = wrapper;
    this.page = frappe.ui.make_app_page({
      parent: wrapper,
      title: "Opportunity List",
      single_column: true,
    });

    // Runtime state
    this.filters = { stage: "", status: "", priority: "", q: "" };
    this.page_length = 20; // initial page size
    this.start = 0; // current offset
    this.total = 0; // total count from server
    this.visible_limit = 20; // max rows shown in list
    this.visible_count = 0; // currently displayed rows
    this.last_fetch_count = 0; // last batch size for load-more
    this.rows_cache = [];   // list rows cache (all fetched rows)
    this.currentOpp = null; // currently selected opportunity
    this._activity_cache = []; // activity cache for selected opp
    this.currentType = "call"; // call | event | task | email (for Section 3)
    this.currentSummaryType = "call"; // call | event | task (for Section 2 Activity Summary)
  }

  render() {
    const waitForContent = () => {
      const $content = $("#support-page-content");
      if (!$content.length) {
        setTimeout(waitForContent, 50);
        return;
      }

      // Inject the full 3-section layout with new toolbar/table UI
      $content.empty().append(frappe.opportunity_list_page_template.body);

      // Cache DOM, bind events, and load data
      this.cacheDom($content);
      this.bind();

      // Start in LIST-ONLY layout
      this.setLayout("list-only");

      // Load initial list
      this.load_opportunities();
      this.setActiveSidebar();
    };

    waitForContent();
  }

  cacheDom($root) {
    this.$root = $root;

    // Sections
    this.$secList = $root.find("#sec-list");
    this.$secDetails = $root.find("#sec-details");
    this.$secActivity = $root.find("#sec-activity");

    // List & toolbar
    this.$tableBody = $root.find("#opp-table tbody");
    this.selected = new Set(); // track selected row names across paging
    this.$selectAll = $root.find("#opp-select-all");

    this.$search = $root.find("#opp-search");
    this.$ddStage = $root.find("#stage-dd");
    this.$ddStatus = $root.find("#status-dd");
    this.$ddPriority = $root.find("#priority-dd");
    this.$btnStage = $root.find('[data-dd="stage-dd"]');
    this.$btnStatus = $root.find('[data-dd="status-dd"]');
    this.$btnPriority = $root.find('[data-dd="priority-dd"]');

    // Details
    this.$details = $root.find("#opp-details");
    this.$items = $root.find("#line-items tbody");
    this.$activitySummary = $root.find("#activity-summary");
    this.$summaryCallsList = $root.find("#summary-calls-list");
    this.$summaryAppointmentsList = $root.find("#summary-appointments-list");
    this.$summaryNotesList = $root.find("#summary-notes-list");
    this.$showActivityBtn = $root.find("#show-activity-btn");
    
    // Activity Summary tabs & forms
    this.$summaryTabs = $root.find("#activity-summary-tabs a");
    this.$summaryTabPanels = $root.find("#activity-summary-tab-content [data-panel]");
    this.$summaryCallForm = $root.find("#summary-call-form");
    this.$summaryAppointmentForm = $root.find("#summary-appointment-form");
    this.$summaryNoteForm = $root.find("#summary-note-form");
    this.currentSummaryType = "call";
    this.$linkToDetails = $root.find("#link-to-details");

    // Charts containers
    this.$brandPie = $root.find("#brand-pie");
    this.$profitPie = $root.find("#profit-pie");

    // Activity tabs & form
    this.$tabs = $root.find("#activity-tabs a");
    this.$tabPanels = $root.find("#activity-tab-content [data-panel]");
    this.$form = $root.find("#activity-form");
    this.$hint = $root.find("#activity-hint");
    this.$btnActivityMain = $root.find("#btn-activity-main");
    this.$activityPick = $root.find(".activity-pick");

    // Per-tab recent lists
    this.$recentCalls = $root.find("#recent-calls");
    this.$recentEvents = $root.find("#recent-events");
    this.$recentTasks = $root.find("#recent-tasks");
    this.$recentEmails = $root.find("#recent-emails");
  }

  bind() {
    // -------- Toolbar: dropdowns ----------
    this.$root.find(".btn.dd").on("click", (e) => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute("data-dd");
      this.$root.find(".dropdown").removeClass("open");
      this.$root.find("#" + id).toggleClass("open");
    });
    $(document).on("click.opp-dd-close", () => {
      this.$root.find(".dropdown").removeClass("open");
    });

    const bindPick = ($menu, key, $btn) => {
      $menu.find("button").on("click", (e) => {
        const value = $(e.currentTarget).data("value") || "";
        const label = $(e.currentTarget).text().trim();
        this.filters[key] = value;
        $btn.find("span:first").text(label || key);
        $menu.removeClass("open");
        if (["stage", "status", "priority", "rows"].includes(key)) {
          // client-side apply (no refetch)
          this.applyFilters();
        }
      });
    };
    bindPick(this.$ddStage, "stage", this.$btnStage);
    bindPick(this.$ddStatus, "status", this.$btnStatus);
    bindPick(this.$ddPriority, "priority", this.$btnPriority);
    // Note: rows dropdown removed, using page size buttons instead

    // -------- Search ----------
    this.$search.on(
      "input",
      frappe.utils.debounce(() => {
        this.filters.q = (this.$search.val() || "").trim().toLowerCase();
        // Reset and reload
        this.reloadList();
      }, 250)
    );

    // -------- Page Size Buttons ----------
    this.$root.find(".btn-paging").on("click", (e) => {
      const $btn = $(e.currentTarget);
      const value = parseInt($btn.data("value"), 10) || 20;
      this.page_length = value;
      this.$root.find(".btn-paging").removeClass("active");
      $btn.addClass("active");
      this.reloadList();
    });

    // Set default highlight for 20 rows
    this.$root.find('.btn-paging[data-value="20"]').addClass("active");

    // -------- Load More Button ----------
    this.$root.find(".btn-load-more").on("click", () => {
      this.load_opportunities(false); // append mode
    });

    // -------- List-row click → open details column ----------
    this.$tableBody.on("click", "tr[data-name]", (e) => {
      const name = e.currentTarget.getAttribute("data-name");
      if (!name) return;
      this.$tableBody.find("tr.opp-row").removeClass("table-active");
      $(e.currentTarget).addClass("table-active");
      this.setLayout("list+details");
      this.scrollTo("#sec-details");
      this.load_details(name);
    });

    // Link in the list header to move focus to details (requires selection)
    this.$linkToDetails.on("click", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.show_alert({ message: __("Select an opportunity first"), indicator: "orange" });
        return;
      }
      this.setLayout("list+details");
      this.scrollTo("#sec-details");
    });

    // Details header: open activity panel
    this.$showActivityBtn.on("click", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.show_alert({ message: __("Select an opportunity first"), indicator: "orange" });
        return;
      }
      this.setLayout("three");
      this.scrollTo("#sec-activity");
    });

    // -------- Activity Tabs ----------
    this.$tabs.on("click", (e) => {
      e.preventDefault();
      const $a = $(e.currentTarget);
      const t = $a.data("type"); // call|event|task|email
      this.$tabs.removeClass("active");
      $a.addClass("active");
      this.currentType = t;
      this.$hint.text(`Creating: ${this.label_for_type(this.currentType)}`);

      this.$tabPanels.addClass("d-none");
      this.$tabPanels.filter(`[data-panel="${t}"]`).removeClass("d-none");

      if (this.currentOpp) {
        this.setLayout("three");
        this.scrollTo("#sec-activity");
        this.populate_recent_by_type(t);
      } else {
        frappe.show_alert({ message: __("Select an opportunity first"), indicator: "orange" });
      }
    });

    // Add Activity main button opens current tab
    this.$btnActivityMain.on("click", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.show_alert({ message: __("Select an opportunity first"), indicator: "orange" });
        return;
      }
      if (!this.currentType) this.currentType = "call";
      this.$hint.text(`Creating: ${this.label_for_type(this.currentType)}`);
      this.setLayout("three");
      this.scrollTo("#sec-activity");
      this.populate_recent_by_type(this.currentType);
    });

    // Split dropdown picks
    this.$activityPick.on("click", (e) => {
      e.preventDefault();
      const type = $(e.currentTarget).data("type");
      this.currentType = type;
      this.$hint.text(`Creating: ${this.label_for_type(type)}`);

      // reflect on tabs
      const $tab = this.$root.find(`#activity-tabs a[data-type="${type}"]`);
      if ($tab.length) {
        this.$tabs.removeClass("active");
        $tab.addClass("active");
        this.$tabPanels.addClass("d-none");
        this.$tabPanels.filter(`[data-panel="${type}"]`).removeClass("d-none");
      }

      if (!this.currentOpp) {
        frappe.show_alert({ message: __("Select an opportunity first"), indicator: "orange" });
        return;
      }
      this.setLayout("three");
      this.scrollTo("#sec-activity");
      this.populate_recent_by_type(type);
    });

    // Activity form submit → create via API
    this.$form.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.msgprint(__("Please select an Opportunity first."));
        return;
      }
      const payload = {
        type: this.currentType,
        opportunity: this.currentOpp.name,
        when: this.$form.find('[name="when"]').val(),
        owner: this.$form.find('[name="owner"]').val(),
        notes: this.$form.find('[name="notes"]').val(),
      };
      frappe.call({
        method: OPPORTUNITY_API.activity_create,
        args: payload,
        freeze: true,
        callback: (r) => {
          if (!r.exc) {
            frappe.show_alert({ message: __("Activity created"), indicator: "green" });
            this.load_activity(this.currentOpp.name);
            this.$form[0].reset();
          }
        },
      });
    });

    // Activity Summary - Tab switching
    this.$summaryTabs.on("click", (e) => {
      e.preventDefault();
      const $a = $(e.currentTarget);
      const t = $a.data("type"); // call|event|task
      this.$summaryTabs.removeClass("active");
      $a.addClass("active");
      this.currentSummaryType = t;
      
      this.$summaryTabPanels.addClass("d-none");
      this.$summaryTabPanels.filter(`[data-panel="${t}"]`).removeClass("d-none");
      
      if (this.currentOpp) {
        this.populate_summary_by_type(t);
      }
    });

    // Activity Summary - Call Form Submit
    this.$summaryCallForm.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.msgprint(__("Please select an Opportunity first."));
        return;
      }
      const payload = {
        type: "call",
        opportunity: this.currentOpp.name,
        when: this.$summaryCallForm.find('[name="when"]').val(),
        owner: this.$summaryCallForm.find('[name="owner"]').val(),
        notes: this.$summaryCallForm.find('[name="notes"]').val(),
      };
      this.create_activity(payload, this.$summaryCallForm);
    });

    // Activity Summary - Appointment Form Submit
    this.$summaryAppointmentForm.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.msgprint(__("Please select an Opportunity first."));
        return;
      }
      const payload = {
        type: "event",
        opportunity: this.currentOpp.name,
        when: this.$summaryAppointmentForm.find('[name="when"]').val(),
        owner: this.$summaryAppointmentForm.find('[name="owner"]').val(),
        notes: this.$summaryAppointmentForm.find('[name="notes"]').val(),
      };
      this.create_activity(payload, this.$summaryAppointmentForm);
    });

    // Activity Summary - Note Form Submit
    this.$summaryNoteForm.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) {
        frappe.msgprint(__("Please select an Opportunity first."));
        return;
      }
      const payload = {
        type: "task",
        opportunity: this.currentOpp.name,
        when: this.$summaryNoteForm.find('[name="when"]').val(),
        owner: this.$summaryNoteForm.find('[name="owner"]').val(),
        notes: this.$summaryNoteForm.find('[name="notes"]').val(),
      };
      this.create_activity(payload, this.$summaryNoteForm);
    });



    // Row checkbox click (avoid opening details)
// Prevent row open when checkbox clicked
this.$tableBody.on("click", "input.opp-row-chk", (e) => {
  e.stopPropagation();
});

this.$tableBody.on("change", "input.opp-row-chk", (e) => {
  const name = e.currentTarget.getAttribute("data-name");
  if (!name) return;
  if (!this.selected) this.selected = new Set();
  if (e.currentTarget.checked) this.selected.add(name);
  else this.selected.delete(name);
  this.updateSelectAllState && this.updateSelectAllState();
});

// Header "Select All"
this.$selectAll && this.$selectAll.on("change", (e) => {
  const checked = e.currentTarget.checked;
  this.$tableBody.find("tr[data-name]").each((_, tr) => {
    const name = tr.getAttribute("data-name");
    if (!name) return;
    const $chk = $(tr).find("input.opp-row-chk");
    $chk.prop("checked", checked);
    if (checked) this.selected.add(name);
    else this.selected.delete(name);
  });
  this.updateSelectAllState && this.updateSelectAllState();
});


  }

  updateSelectAllState() {
  if (!this.$selectAll || !this.$selectAll.length) return;
  const $rows = this.$tableBody.find('tr[data-name]');
  if (!$rows.length) {
    this.$selectAll.prop('checked', false).prop('indeterminate', false);
    return;
  }
  let selectedOnPage = 0;
  $rows.each((_, tr) => {
    const name = tr.getAttribute('data-name');
    if (name && this.selected && this.selected.has(name)) selectedOnPage++;
  });
  if (selectedOnPage === 0) {
    this.$selectAll.prop('checked', false).prop('indeterminate', false);
  } else if (selectedOnPage === $rows.length) {
    this.$selectAll.prop('checked', true).prop('indeterminate', false);
  } else {
    this.$selectAll.prop('checked', false).prop('indeterminate', true);
  }
}

getSelected() {
  // Returns an array of selected Opportunity names
  return Array.from(this.selected);
}

clearSelection() {
  this.selected.clear();
  this.$tableBody.find('input.opp-row-chk').prop('checked', false);
  this.updateSelectAllState();
}


  // ------------- Layout Manager -------------
  setLayout(mode) {
    if (mode === "list-only") {
      this.$secDetails.hide();
      this.$secActivity.hide();
      this.$secList.removeClass().addClass("col-12 fade-in");
      this.$showActivityBtn && this.$showActivityBtn.hide();
      this.$linkToDetails && this.$linkToDetails.hide();
      return;
    }
    if (mode === "list+details") {
      this.$secActivity.hide();
      this.$secDetails.show().addClass("fade-in");
      this.$secList.removeClass().addClass("split-left fade-in");
      this.$secDetails.removeClass().addClass("split-right fade-in");
      this.$secActivity.removeClass();
      this.$showActivityBtn && this.$showActivityBtn.show();
      this.$linkToDetails && this.$linkToDetails.show();
      return;
    }
    if (mode === "three") {
      this.$secDetails.show();
      this.$secActivity.show().addClass("fade-in");
      this.$secList.removeClass().addClass("split-third fade-in");
      this.$secDetails.removeClass().addClass("split-middle fade-in");
      this.$secActivity.removeClass().addClass("split-third fade-in");
      this.$showActivityBtn && this.$showActivityBtn.show();
      this.$linkToDetails && this.$linkToDetails.show();
    }
  }

  // Smooth scroll helper
  scrollTo(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      const $el = $(selector);
      if ($el.length) $("html, body").animate({ scrollTop: $el.offset().top - 70 }, 200);
    }
  }

  // ------------------------------ Data: List ------------------------------
  reloadList() {
    // Reset and fetch from beginning
    this.start = 0;
    this.visible_count = 0;
    this.visible_limit = this.page_length;
    this.last_fetch_count = 0;
    this.rows_cache = [];
    this.load_opportunities(true);
  }

  load_opportunities(reset = true) {
    if (reset) {
      this.start = 0;
      this.visible_count = 0;
      this.visible_limit = this.page_length;
      this.last_fetch_count = 0;
      this.rows_cache = [];
      this.$tableBody.html(`
        <tr><td colspan="10" class="text-muted small py-3">
          ${__("Loading opportunities…")}
        </td></tr>
      `);
      this.selected.clear();
    } else {
      this.visible_limit += this.page_length;
    }

    const q = this.$search.val() || "";

    frappe.call({
      method: OPPORTUNITY_API.list,
      args: { 
        q,
        limit_start: this.start,
        limit_page_length: this.page_length
      },
      callback: (r) => {
        if (r.message) {
          const newRows = Array.isArray(r.message) ? r.message : [];
          this.last_fetch_count = newRows.length;
          
          if (reset) {
            this.rows_cache = newRows;
          } else {
            // Append mode
            this.rows_cache = this.rows_cache.concat(newRows);
          }
          
          this.start += newRows.length;
          this.applyFilters();
        }
      },
    });
  }
render_rows(rows, options = { append: false }) {
  if (!options.append) this.$tableBody.empty();

  if (!rows.length && !options.append) {
    this.$tableBody.append(`
      <tr><td colspan="10" class="text-muted small py-3">${__("No opportunities found")}</td></tr>
    `);
    // Reset middle/right panels when the list is empty
    this.setLayout("list-only");
    this.$details.html(`<span class="text-muted">${__("Select an opportunity from the left to view details.")}</span>`);
    this.$items.empty(); this.$brandPie.empty(); this.$profitPie.empty(); 
    this.$summaryCallsList.empty(); this.$summaryAppointmentsList.empty(); this.$summaryNotesList.empty();
    this.currentOpp = null; this._activity_cache = [];
    this.updateSelectAllState && this.updateSelectAllState();
    this.updateLoadMoreVisibility && this.updateLoadMoreVisibility(1);
    return;
  }

  rows.forEach((row) => {
    const id = frappe.utils.escape_html(row.name || "");

    const title   = frappe.utils.escape_html(row.title || row.subject || "");
    const company = frappe.utils.escape_html(row.company || row.customer_name || row.party_name || "");
    const amount  = frappe.format(row.opportunity_amount, { fieldtype: "Currency" });

    const stage      = frappe.utils.escape_html(row.sales_stage || row.stage || row.status || "");
    const close_date = frappe.format(row.expected_closing, { fieldtype: "Date" });

    // Prefer explicit sales person fields; fall back to owner
    const salesperson_name  = frappe.utils.escape_html(row.sales_person_name || row.owner_full_name || row.owner || "");
    const salesperson_email = frappe.utils.escape_html(row.sales_person_email || row.owner_email || "");
    const avatar_txt        = this.initials(salesperson_name || salesperson_email || title);

    const $tr = $(`
      <tr class="opp-row" data-name="${id}" style="cursor:pointer">
        <td>
          <input type="checkbox" class="opp-row-chk" data-name="${id}" aria-label="Select row ${id}"/>
        </td>
        <td>${id}</td>
        <td>
          <div class="title-sub">
            
            <div>
              <div class="title truncate-2">${title}</div>
              <div class="sub truncate-1">${company ? "by " + company : ""}</div>
            </div>
          </div>
        </td>

        <!-- Value: right aligned -->
        <td class="num">${amount || ""}</td>

        
        <td>${this.stageForStatus(stage)}</td>
        <td>${close_date || ""}</td>

        <!-- Sales Person -->
        <td>
          <div class="person">
            <div class="avatar">${avatar_txt}</div>
            <div>
              <div class="name truncate-1">${salesperson_name}</div>
              <div class="muted truncate-1">${salesperson_email}</div>
            </div>
          </div>
        </td>
      </tr>
    `);

    // Apply checked state programmatically
    if (this.selected && this.selected.has(id)) {
      $tr.find('input.opp-row-chk').prop('checked', true);
    }

    // Accessibility / keyboard
    $tr.attr("tabindex", 0).on("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        $tr.trigger("click");
      }
    });

    this.$tableBody.append($tr);
  });

  this.updateSelectAllState && this.updateSelectAllState();
}


 applyFilters() {
    const f = this.filters;
    const q = (f.q || "").toLowerCase();

    const filtered = this.rows_cache.filter((row) => {
      const stage = (row.sales_stage || row.stage || row.status || "").trim();
      const status = (row.status || "").trim();
      const priority = (row.priority || "").trim();

      const textBits = [
        row.name, row.title, row.subject, row.company, row.customer_name, row.party_name,
        row.contact_person_name, row.contact_person, row.contact_email,
        row.owner_full_name, row.owner, row.lead_source, row.source
      ].filter(Boolean).join(" ").toLowerCase();

      let ok = true;
      if (f.stage && f.stage !== stage) ok = false;
      if (f.status && f.status !== status) ok = false;
      if (f.priority && f.priority !== priority) ok = false;
      if (q && !textBits.includes(q)) ok = false;
      return ok;
    });

    const displayRows = filtered.slice(0, this.visible_limit);
    this.visible_count = displayRows.length;
    this.render_rows(displayRows, { append: false });
    this.updateLoadMoreVisibility(filtered.length);
    // this.updatePaginationInfo();
  }

  updateLoadMoreVisibility(totalFiltered) {
    const $loadMore = this.$root.find(".btn-load-more");
    const total = typeof totalFiltered === "number" ? totalFiltered : this.visible_count;
    const hasMoreLocal = total > this.visible_count;
    const hasMoreServer = this.last_fetch_count === this.page_length;
    if (this.visible_count > 0 && (hasMoreLocal || hasMoreServer)) {
      $loadMore.show();
    } else {
      $loadMore.hide();
    }
  }


  // Pagination info display
  updatePaginationInfo() {
    const $info = this.$root.find(".pagination-info");
    if ($info.length) {
      $info.text(`Showing ${this.visible_count} opportunities`);
    }
  }



  // ------------------------------ Data: Details column ------------------------------
  load_details(opp_name) {
    this.currentOpp = { name: opp_name };

    // Skeleton while loading
    this.$details.html(`<span class="text-muted">${__("Loading details…")}</span>`);
    this.$items.empty();
    this.$brandPie.empty();
    this.$profitPie.empty();
    this.$summaryCallsList.empty();
    this.$summaryAppointmentsList.empty();
    this.$summaryNotesList.empty();
    this._activity_cache = [];

    frappe.call({
      method: OPPORTUNITY_API.detail,
      args: { name: opp_name },
      callback: (r) => {
        const d = r.message || {};
        this.render_details(d);
        this.render_items(d.items || []);
        this.render_charts(
          d.brand_pie || { labels: [], values: [] },
          d.profit_pie || { labels: [], values: [] }
        );
        this.load_activity(opp_name);
      },
    });
  }

  // render_details(d) {
  //   const html = `
  //     <div class="row g-3">
  //       <div class="col-md-6"><strong>${__("Opportunity ID")}:</strong> ${frappe.utils.escape_html(d.name || "")}</div>
  //       <div class="col-md-6"><strong>${__("Subject")}:</strong> ${frappe.utils.escape_html(d.title || d.subject || "")}</div>
  //       <div class="col-md-6"><strong>${__("Customer / Account")}:</strong> ${frappe.utils.escape_html(d.party_name || d.customer_name || "")}</div>
  //       <div class="col-md-6"><strong>${__("Stage")}:</strong> ${frappe.utils.escape_html(d.sales_stage || d.sales_stage || "")}</div>
  //       <div class="col-md-6"><strong>${__("Value")}:</strong> ${frappe.format(d.opportunity_amount, { fieldtype: "Currency" })}</div>
  //       <div class="col-md-6"><strong>${__("Expected Closure Date")}:</strong> ${frappe.format(d.expected_closing, { fieldtype: "Date" })}</div>
  //       <div class="col-md-6"><strong>${__("Sales Person")}:</strong> ${frappe.utils.escape_html(d.owner_full_name || d.owner || "")}</div>
  //     </div>
  //   `;
  //   this.$details.html(html);
  // }
 render_details(d) {
  const stageBadgeHtml = this.getStatusBadge(d.sales_stage || "");
  
  const html = `
    <div class="opp-details-card">
      <div class="details-header-top">
        <div class="details-subject-area">
          <h5 class="details-subject">${frappe.utils.escape_html(d.title || d.subject || "No Subject")} - ${stageBadgeHtml}</h5>
          <div class="details-id">${frappe.utils.escape_html(d.name || "")}</div>
        </div>
        <div class="details-amount-area">
          
          <div class="details-amount-value">${frappe.format(d.opportunity_amount, { fieldtype: "Currency" })}</div>
        </div>
      </div>

      
      
      <div class="details-grid-3col mt-4">
        <!-- Column 1 -->
        <div class="details-col">
          <div class="details-field">
            <div class="details-label">${__("CUSTOMER")}</div>
            <div class="details-value">${frappe.utils.escape_html(d.party_name || d.customer_name || "")}</div>
          </div>
          <div class="details-field">
            <div class="details-label">${__("OWNER")}</div>
            <div class="details-value">${frappe.utils.escape_html(d.owner_full_name || d.owner || "")}</div>
          </div>
        </div>

        <!-- Column 2 -->
        <div class="details-col">
          <div class="details-field">
            <div class="details-label">${__("STATUS")}</div>
            <div class="details-value">${frappe.utils.escape_html(d.status || "")}</div>
          </div>
          <div class="details-field">
            <div class="details-label">${__("EXPECTED CLOSURE DATE")}</div>
            <div class="details-value">${frappe.format(d.expected_closing, { fieldtype: "Date" })}</div>
          </div>
        </div>

        <!-- Column 3 -->
        <div class="details-col">
          <!-- Empty since Amount moved to top -->
          <div class="details-field">
            <div class="details-label">${__("CONTACT PERSON")}</div>
            <div class="details-value">${frappe.utils.escape_html(d.contact_display || "")}</div>
          </div>
          <div class="details-field">
            <div class="details-label">${__("MOBILE")}</div>
            <div class="details-value">${frappe.utils.escape_html(d.contact_mobile || "")}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  this.$details.html(html);

  // Re-attach your existing click handler for the button
  this.$showActivityBtn = this.$details.find("#show-activity-btn");
  if (this.currentOpp) { this.$showActivityBtn.show(); }
  this.$showActivityBtn.on("click", (e) => {
    e.preventDefault();
    if (!this.currentOpp) {
      frappe.show_alert({ message: __("Select an opportunity first"), indicator: "orange" });
      return;
    }
    this.setLayout("three");
    this.scrollTo("#sec-activity");
  });
}

  

  render_items(items) {
  this.$items.empty();

  if (!items.length) {
    this.$items.append(`
      <tr><td colspan="7" class="text-muted small">${__("No line items")}</td></tr>
    `);
    return;
  }

  items.forEach((it) => {
    const qty    = frappe.format(it.qty,    { fieldtype: "Float" });
    const rate   = frappe.format(it.rate,   { fieldtype: "Currency" });
    const amount = frappe.format(it.amount, { fieldtype: "Currency" });
    const itemName = frappe.utils.escape_html(it.item_name || it.item_code || "");
    const itemSub = frappe.utils.escape_html(
      (it.item_name && it.item_code && it.item_name !== it.item_code ? it.item_code : "") ||
      it.description ||
      ""
    );

    const $tr = $(`
      <tr>
        <td>
          <div class="line-item-title">
            <div class="name">${itemName}</div>
            ${itemSub ? `<div class="sub">${itemSub}</div>` : ""}
          </div>
        </td>
        <td>${frappe.utils.escape_html(it.brand || "")}</td>

        <!-- numeric: centered -->
        <td class="line-items-center">${qty}</td>
        <td class="line-items-center">${rate}</td>
        <td class="line-items-center">${amount}</td>

        <td>${frappe.utils.escape_html(it.sales_stage || "")}</td>
        <td>${frappe.utils.escape_html(it.opportunity_type || "")}</td>
        <td>${frappe.utils.escape_html(it.renewal_id || "")}</td>
      </tr>
    `);

    this.$items.append($tr);
  });
}


  render_charts(brand_pie, profit_pie) {
    if (!frappe.Chart) {
      this.$brandPie.html(`<div class="text-muted small">${__("Chart library not loaded")}</div>`);
      this.$profitPie.html(`<div class="text-muted small">${__("Chart library not loaded")}</div>`);
      return;
    }
    this.$brandPie.empty();
    this.$profitPie.empty();

    const palette = ["#4F8EF7", "#3BC9DB", "#845EF7", "#51CF66", "#FF922B"];
    const common = { type: "pie", height: 220, colors: palette };
    new frappe.Chart("#brand-pie", {
      ...common,
      data: {
        labels: brand_pie.labels || [],
        datasets: [{ values: brand_pie.values || [] }],
      },
    });
    new frappe.Chart("#profit-pie", {
      ...common,
      data: {
        labels: profit_pie.labels || [],
        datasets: [{ values: profit_pie.values || [] }],
      },
    });
  }

  // ------------------------------ Data: Activity panel ------------------------------
  load_activity(opp_name) {
    this.$summaryCallsList.empty().append(
      `<li class="list-group-item text-muted small">${__("Loading...")}</li>`
    );
    this.$summaryAppointmentsList.empty().append(
      `<li class="list-group-item text-muted small">${__("Loading...")}</li>`
    );
    this.$summaryNotesList.empty().append(
      `<li class="list-group-item text-muted small">${__("Loading...")}</li>`
    );

    frappe.call({
      method: OPPORTUNITY_API.activity_list,
      args: { name: opp_name },
      callback: (r) => {
        const items = r.message || [];
        this._activity_cache = items;
        this.render_activity_summary(items);

        // If Activity tab is visible, populate relevant list
        this.populate_recent_by_type(this.currentType);
      },
    });
  }

  render_activity_summary(items) {
    // Store items for later tab switching
    this._activity_cache = items;
    
    // Populate current active tab
    this.populate_summary_by_type(this.currentSummaryType);
  }

  populate_summary_by_type(t) {
    // Clear all lists
    this.$summaryCallsList.empty();
    this.$summaryAppointmentsList.empty();
    this.$summaryNotesList.empty();
    
    if (!this._activity_cache || !this._activity_cache.length) {
      this.$summaryCallsList.append(
        `<li class="list-group-item text-muted small">${__("No calls yet")}</li>`
      );
      this.$summaryAppointmentsList.append(
        `<li class="list-group-item text-muted small">${__("No appointments yet")}</li>`
      );
      this.$summaryNotesList.append(
        `<li class="list-group-item text-muted small">${__("No notes yet")}</li>`
      );
      return;
    }
    
    const typeMap = {
      call: (x) => (x.type || "").toLowerCase() === "phone" || (x.type || "").toLowerCase() === "call",
      event: (x) => (x.type || "").toLowerCase() === "appointment" || (x.type || "").toLowerCase() === "event",
      task: (x) => (x.type || "").toLowerCase() === "task" || (x.type || "").toLowerCase() === "note",
    };
    
    const items = this._activity_cache.filter(typeMap[t] || (() => false));
    
    // Render item function
    const renderItem = (x) => `
      <li class="list-group-item d-flex justify-content-between align-items-start">
        <div class="me-2">
          <div class="fw-semibold">${frappe.utils.escape_html(x.subject || x.content || x.description || "")}</div>
          <div class="text-muted small">${frappe.format(x.when, { fieldtype: "Datetime" })} · ${frappe.utils.escape_html(x.owner || "")}</div>
        </div>
        <span class="badge bg-${x.status === "Completed" ? "success" : "secondary"} align-self-start">
          ${frappe.utils.escape_html(x.status || "")}
        </span>
      </li>
    `;
    
    if (t === "call") {
      if (!items.length) {
        this.$summaryCallsList.append(`<li class="list-group-item text-muted small">${__("No calls")}</li>`);
      } else {
        items.slice(0, 10).forEach((x) => this.$summaryCallsList.append(renderItem(x)));
      }
    } else if (t === "event") {
      if (!items.length) {
        this.$summaryAppointmentsList.append(`<li class="list-group-item text-muted small">${__("No appointments")}</li>`);
      } else {
        items.slice(0, 10).forEach((x) => this.$summaryAppointmentsList.append(renderItem(x)));
      }
    } else if (t === "task") {
      if (!items.length) {
        this.$summaryNotesList.append(`<li class="list-group-item text-muted small">${__("No notes")}</li>`);
      } else {
        items.slice(0, 10).forEach((x) => this.$summaryNotesList.append(renderItem(x)));
      }
    }
  }

  create_activity(payload, $form) {
    frappe.call({
      method: OPPORTUNITY_API.activity_create,
      args: payload,
      freeze: true,
      callback: (r) => {
        if (!r.exc) {
          frappe.show_alert({ message: __("Activity created"), indicator: "green" });
          this.load_activity(this.currentOpp.name);
          $form[0].reset();
        }
      },
    });
  }

  populate_recent_by_type(t) {
    // clear all lists
    this.$recentCalls.empty();
    this.$recentEvents.empty();
    this.$recentTasks.empty();
    this.$recentEmails.empty();

    if (!this._activity_cache || !this._activity_cache.length) return;

    const typeMap = {
      call: (x) => (x.type || "").toLowerCase() === "phone" || (x.type || "").toLowerCase() === "call",
      event: (x) => (x.type || "").toLowerCase() === "appointment" || (x.type || "").toLowerCase() === "event",
      task: (x) => (x.type || "").toLowerCase() === "task",
      email: (x) => (x.type || "").toLowerCase() === "email",
    };

    const items = this._activity_cache.filter(typeMap[t] || (() => false)).slice(0, 10);

    const renderItem = (x) => `
      <li class="list-group-item d-flex justify-content-between align-items-start">
        <div class="me-2">
          <div class="fw-semibold">${frappe.utils.escape_html(x.subject || x.description || x.content || "")}</div>
          <div class="text-muted small">${frappe.format(x.when, { fieldtype: "Datetime" })} · ${frappe.utils.escape_html(x.owner || "")}</div>
        </div>
        <span class="badge bg-${x.status === "Completed" ? "success" : "secondary"} align-self-start">
          ${frappe.utils.escape_html(x.status || "")}
        </span>
      </li>
    `;

    if (t === "call") {
      if (!items.length) this.$recentCalls.append(`<li class="list-group-item text-muted small">No calls</li>`);
      items.forEach((x) => this.$recentCalls.append(renderItem(x)));
    } else if (t === "event") {
      if (!items.length) this.$recentEvents.append(`<li class="list-group-item text-muted small">No appointments</li>`);
      items.forEach((x) => this.$recentEvents.append(renderItem(x)));
    } else if (t === "task") {
      if (!items.length) this.$recentTasks.append(`<li class="list-group-item text-muted small">No tasks</li>`);
      items.forEach((x) => this.$recentTasks.append(renderItem(x)));
    } else if (t === "email") {
      if (!items.length) this.$recentEmails.append(`<li class="list-group-item text-muted small">No emails</li>`);
      items.forEach((x) => this.$recentEmails.append(renderItem(x)));
    }
  }

  // ------------------------------ Utilities ------------------------------
  label_for_type(t) {
    return ({ call: "Call", event: "Appointment", task: "Task", email: "Email" }[t] || t);
  }

  initials(name) {
    const n = (name || "").trim();
    if (!n) return "U";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map(s => s[0]?.toUpperCase() || "").join("") || "U";
  }

  pillForStatus(status) {
    const s = (status || "").toLowerCase();
    let cls = "pill-inprogress", label = status || "";
    if (s === "open") cls = "pill-open";
    else if (s === "closed" || s === "lost" || s === "cancelled") cls = "pill-closed";
    return `<span class="pill ${cls}">${frappe.utils.escape_html(label)}</span>`;
  }


  stageForStatus(stage) {
    const s = (stage || "");
    let cls = "pill-inprogress", label = stage || "";
    if (s === "Initial Analysis") cls = "pill-inprogress";
    else if (s === "POC/Demos/Webinar/Session" ) cls = "pill-closed";
    else if (s === "Proposal" ) cls = "pill-inprogress";
    else if (s === "Negotiation" ) cls = "pill-negotiation";
    else if (s === "Order Committed" ) cls = "pill-committed";
    else if (s === "Closed Won" ) cls = "pill-won";
    else if (s === "Closed Lost" || s === "Cancelled") cls = "pill-closed";
    return `<span class="pill ${cls}">${frappe.utils.escape_html(label)}</span>`;
  }


  pillForPriority(priority) {
    const p = (priority || "").toLowerCase();
    let cls = "pill-medium", label = priority || "";
    if (p === "high") cls = "pill-high";
    else if (p === "low") cls = "pill-low";
    return `<span class="pill ${cls}">${frappe.utils.escape_html(label)}</span>`;
  }

  getStatusBadge(status) {
    if (!status) return "";
    const s = (status || "").toLowerCase();
    let badgeClass = "badge-medium";
    
    // Priority-based
    if (s === "high") badgeClass = "badge-high";
    else if (s === "low") badgeClass = "badge-low";
    else if (s === "critical") badgeClass = "badge-critical";
    
    // Stage/Status-based
    else if (s === "open" || s.includes("initial") || s.includes("prospecting")) badgeClass = "badge-open";
    else if (s === "closed lost" || s === "cancelled" || s === "lost") badgeClass = "badge-closed";
    else if (s === "closed won" || s === "won") badgeClass = "badge-open";
    else if (s.includes("negotiation") || s.includes("proposal")) badgeClass = "badge-medium";
    
    return `<span class="status-badge ${badgeClass}">${frappe.utils.escape_html(status)}</span>`;
  }

  // --------- Sidebar state ----------
  setActiveSidebar() {
    const route = frappe.get_route();
    const baseRoute = route[0]; // "opportunity-list"

    $(".side-nav-link").removeClass("active-menu");
    $(".side-nav-item").removeClass("active-menu-item");
    $(".menu-parent").removeClass("active");

    $(".side-nav-link[data-page]").each(function () {
      const linkPage = $(this).data("page");
      if (!linkPage) return;

      if (linkPage === baseRoute) {
        $(this).addClass("active-menu");
        const $item = $(this).closest(".side-nav-item");
        $item.addClass("active-menu-item");
        const $parent = $(this).closest(".menu-parent");
        if ($parent.length) {
          $parent.addClass("active");
          $parent.closest(".sub-menu").each((idx, el) => {
            const $ancestor = $(el).closest(".menu-parent");
            if ($ancestor.length) $ancestor.addClass("active");
          });
        }
      }
    });
  }

  handleRoute() {
    this.setActiveSidebar();
  }
};

// -------------------- TEMPLATE --------------------
// Combines: new toolbar/table (screenshot look) + your 3-column layout + activity tabs.
frappe.opportunity_list_page_template = {
  body: `
    <style>
      /* Smooth fades for section changes */
      .fade-in { animation: fadeIn .18s ease-in; }
      @keyframes fadeIn { from { opacity: 0.0; transform: translateY(2px); } to { opacity: 1.0; transform: translateY(0); } }
      /* Optional: better scroll on large screens for the list */
      @media (min-width: 992px) { .list-pane-scroll { max-height: calc(100vh - 280px); overflow: auto; } }
      .anchor-offset { scroll-margin-top: 90px; }

      /* ===== Screenshot-style theme (scoped) ===== */
      .opp-wrap{padding:16px}
      :root{
        --bg: #f5f7fb;
        --card: #ffffff;
        --text: #1c2430;
        --muted: #6b7280;
        --line: #e6e9f2;
        --radius: 10px;
        --shadow: 0 1px 2px rgba(16,24,40,.04), 0 4px 10px rgba(16,24,40,.06);
        --green-600:#16a34a; --green-50:#ecfdf5;
        --orange-600:#ea580c; --orange-50:#fff7ed;
        --red-600:#dc2626; --red-50:#fef2f2;
        --blue-600:#2563eb; --blue-50:#eff6ff;
        --amber-600:#d97706; --amber-50:#fffbeb;
        --gray-100:#f3f4f6;
      }
      .opp-wrap .card{
        background:var(--card); border:1px solid var(--line);
        border-radius:var(--radius); box-shadow:var(--shadow);
      }
      .opp-header{display:flex; align-items:center; justify-content:space-between; margin-bottom:12px}
      .opp-title{font-size:16px; font-weight:600; margin:0}
      .opp-breadcrumbs{display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px}
      .chev{opacity:.6}

      .opp-toolbar{padding:12px; margin-bottom:14px}
      .toolbar-row{display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap}
      .search-box{
        display:flex; align-items:center; gap:8px;
        border:1px solid var(--line); background:#fff; border-radius:8px; padding:8px 10px; min-width:260px
      }
      .search-box input{border:none; outline:none; width:240px; font:inherit}
      .search-box .icon{opacity:.5}
      .toolbar-right{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
      .filter-label{color:var(--muted); font-size:12px; margin-right:4px}
      .btn.dd{
        appearance:none; border:1px solid var(--line); background:#fff; color:#0f172a;
        padding:8px 10px; border-radius:8px; cursor:pointer;
        display:inline-flex; align-items:center; gap:8px; font-weight:500
      }
      .btn.dd:hover{border-color:#d8dbe7}
      .btn.ghost{background:transparent; border:1px solid var(--line); border-radius:8px; padding:8px}
      .filter{position:relative}
      .caret{opacity:.5}
      .dropdown{
        position:absolute; top:44px; left:0; min-width:160px; background:#fff;
        border:1px solid var(--line); border-radius:10px; box-shadow:var(--shadow);
        display:none; z-index:50; padding:6px
      }
      .dropdown.open{display:block}
      .dropdown button{
        width:100%; text-align:left; padding:8px 10px; border:none; background:transparent; border-radius:8px; cursor:pointer
      }
      .dropdown button:hover{background:var(--gray-100)}

      .table-card{padding:0}
      .table-wrapper{overflow:auto}
      .opp-table{width:100%; border-collapse:separate; border-spacing:0}
      .opp-table thead th{
        text-align:left; font-size:12px; color:var(--muted); font-weight:bold; padding:12px 14px; border-bottom:1px solid var(--line); white-space:nowrap;
      }
        /* Make table header text black */
.opp-table thead th {
    
    font-size:14px;
    font-weight: 700;   /* optional: keeps strong, bold header look */
}
      .opp-table tbody td{ padding:12px 14px; border-bottom:1px solid var(--line); vertical-align:middle }
      .opp-table tbody tr:hover{background:#fafbfd}
      .opp-table tbody tr:nth-child(even){background:#fcfdff}

      .title-sub{display:flex; align-items:center; gap:10px}
      .logo.circle{
        width:28px; height:28px; border-radius:50%;
        display:grid; place-items:center; color:#fff; font-weight:700; font-size:13px; background:#3b82f6;
      }
      .title{font-weight:600}
      .sub{color:var(--muted); font-size:12px}
      .person{display:flex; align-items:center; gap:10px}
      .avatar{ width:28px; height:28px; border-radius:50%; background:#e5e7eb; color:#111827; display:grid; place-items:center; font-weight:700; font-size:12px }
      .name{font-weight:600}
      .muted{color:var(--muted); font-size:12px}


      /* Right align numeric values and use tabular figures */
.num{  font-variant-numeric: tabular-nums; }
.num1{ font-variant-numeric: tabular-nums; }

/* Column widths AFTER adding checkbox as column 1 */
.opp-table thead th:nth-child(1){ width: 20px;  } /* Checkbox */
.opp-table thead th:nth-child(2){ width: 80px; } /* ID */
.opp-table thead th:nth-child(3){ width: 360px; } /* Subject */
.opp-table thead th:nth-child(4){ width: 140px; text-align:left; } /* Value */
.opp-table thead th:nth-child(5){ width: 140px; } /* Stage */
.opp-table thead th:nth-child(6){ width: 140px; } /* Close Date */
.opp-table thead th:nth-child(7){ width: 220px; } /* Sales Person */

/* Ensure body cell for Value is right-aligned as well */
.opp-table tbody td:nth-child(4){ text-align:right; }

/* Avatar circle stays perfect and vertically centered */
.person{ display:flex; align-items:center; gap:10px; }
.person .avatar{
  width:28px; height:28px; flex:0 0 28px;
  border-radius:50%;
  background:#e5e7eb; color:#111827;
  display:grid; place-items:center; line-height:1; font-weight:700; font-size:12px;
}






      .badge.stage{ background:var(--blue-50); color:var(--blue-600); border:1px solid #dbeafe; padding:4px 8px; border-radius:999px; font-weight:600; font-size:12px }
      
      
      
      .pill{padding:3px 8px; border-radius:999px; font-weight:700; font-size:11px; display:inline-block}
      .pill-won{background:var(--green-50); color:var(--green-600); border:1px solid #4aa56a}
      .pill-inprogress{background:var(--yellow-50); color:var(--yellow-600); border:1px solid #eed202}
      .pill-closed{background:var(--red-50); color:var(--red-600); border:1px solid #eb4a4a}
      .pill-negotiation{background:var(--blue-50); color:var(--blue-600); border:1px solid #1f0e5f}
      .pill-medium{background:var(--amber-50); color:var(--amber-600); border:1px solid #fde68a}
      .pill-low{background:#ecfeff; color:#0891b2; border:1px solid #a5f3fc}

      @media (max-width: 980px){
        .opp-table thead{display:none}
        .opp-table, .opp-table tbody, .opp-table tr, .opp-table td{display:block; width:100%}
        .opp-table tbody tr{border-bottom:1px solid var(--line); padding:8px}
        .opp-table tbody td{border-bottom:none; padding:6px 0}
      }








      /* ===== Activity Tabs (screenshot look) ===== */
.activity-tabs{
  display:flex; align-items:center; gap:28px;
  border-bottom:1px solid #e9edf5; /* light divider like your screenshot */
  margin-bottom:10px; padding:0 2px;
}
.activity-tabs li{list-style:none}
.activity-tabs .tab-btn{
  display:flex; align-items:center; gap:8px;
  padding:10px 0;
  color:#475569; /* slate-600 */
  text-decoration:none; position:relative;
  font-weight:600;
}
.activity-tabs .tab-btn .ico{
  width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center;
  color:currentColor; opacity:.9;
}
.activity-tabs .tab-btn:hover{color:#ef4444} /* hover red */
.activity-tabs .tab-btn.active{
  color:#ef4444; /* active red text */
}
.activity-tabs .tab-btn.active::after{
  content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px;
  background:#ef4444; border-radius:2px; /* red underline under active tab */
}

/* ===== Equal heights for panes ===== */
.equal-row { display: flex; gap: 12px; align-items: stretch; flex-wrap: nowrap; }
.equal-row > [class*="col-"] { display: flex; flex-direction: column; }
.equal-pane { display:flex; flex-direction:column; }
.equal-pane .card.h-100, .equal-pane .card { display:flex; flex-direction:column; }
#sec-list.split-left{ flex:0 0 32%; max-width:32%; }
#sec-details.split-right{ flex:0 0 68%; max-width:68%; }
#sec-list.split-third, #sec-activity.split-third{ flex:0 0 25%; max-width:25%; }
#sec-details.split-middle{ flex:0 0 50%; max-width:50%; }

@media (max-width: 992px){
  .equal-row{ flex-wrap: wrap; }
  #sec-list.split-left,
  #sec-details.split-right,
  #sec-list.split-third,
  #sec-details.split-middle,
  #sec-activity.split-third{ flex:0 0 100%; max-width:100%; }
}
.equal-scroll {
  /* Adjust 260px if your top header/toolbar stack is taller/shorter */
  max-height: calc(100vh - 260px);
  overflow: auto;
}

/* Apply scroll to our list and details content areas */
#sec-list .card-body{
  display:flex;
  flex-direction:column;
  height: 100%;
}
#sec-list .list-pane-scroll{
  flex:1 1 auto;
  min-height:0;
  overflow-y:auto;
}
#sec-list .list-paging-bar{
  border-top:1px solid var(--line);
  background:#f8fafc;
}
.list-paging-area{
  overflow-x:auto;
  padding-bottom:4px;
}
.list-paging-area .btn-group{
  flex-wrap:nowrap;
}
#sec-details .card-body.equal-scroll,
#sec-activity .card-body.equal-scroll { padding-bottom: 8px; }

/* Pagination: sticky at top of list area */
  .list-pane-scroll{ position:relative; }
      .opp-page-btn{ min-width:32px; height:32px; border:1px solid var(--line); background:#fff; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-weight:600; color:#0f172a; user-select:none }
      .opp-page-btn:hover{ border-color:#d8dbe7 }
      .opp-page-btn[disabled]{ opacity:.5; cursor:not-allowed }
      .opp-page-btn.active{ background:var(--blue-50); color:var(--blue-600); border-color:#dbeafe }
      
      /* Page size button styles */
      .btn-paging.active { background: var(--primary) !important; color: #fff !important; border-color: var(--primary) !important; }
      .btn-load-more { min-width: 120px; }

/* ===== Fixed row height + ellipsis ===== */
:root { --row-h: 64px; } /* set your desired row height (56/64/72 px) */

/* force fixed layout so ellipsis works predictably */
.opp-table{ table-layout: fixed; }

/* make all rows equal height */
.opp-table tbody tr{ height: var(--row-h); }

/* prevent cells from growing, clip overflow inside cells */
.opp-table tbody td{
  overflow: hidden;           /* hide overflowed content */
  vertical-align: middle;     /* keep content centered vertically */
}

/* single-line ellipsis */
.truncate-1{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* two-line clamp ellipsis (WebKit & most modern browsers) */
.truncate-2{
  display: -webkit-box;
  -webkit-line-clamp: 2;      /* number of visible lines */
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* keep the "Opportunity" column from becoming too narrow/too wide */
.opp-table thead th:nth-child(1){ width: 20px; }  /* ID */
.opp-table thead th:nth-child(2){ width: 100px; }  /* Opportunity (title/sub) */
.opp-table thead th:nth-child(3){ width: 240px; }  /* Contact person */
.opp-table thead th:nth-child(4){ width: 140px; }  /* Stage */
.opp-table thead th:nth-child(5){ width: 120px; }  /* Value */
.opp-table thead th:nth-child(6){ width: 140px; }  /* Close Date */
.opp-table thead th:nth-child(7){ width: 140px; }  /* Lead Source */
.opp-table thead th:nth-child(8){ width: 160px; }  /* Owner */
.opp-table thead th:nth-child(9){ width: 120px; }  /* Status */
.opp-table thead th:nth-child(10){ width: 120px; } /* Priority */
.opp-table thead th:nth-child(11){ width: 50px; }  /* ID */

/* Make VALUE and DATE thicker/bold */
.opp-table tbody td:nth-child(2),
.opp-table tbody td:nth-child(4),
.opp-table tbody td:nth-child(6) {
    font-weight: 600 !important;   /* thicker text */
}

/* Optional: Make headers bold too */
.opp-table thead th:nth-child(4),
.opp-table thead th:nth-child(6) {
    font-weight: 700 !important;
    
}



/* keep the person block from expanding too much horizontally */
.person{ min-width: 0; }                 /* allow children to shrink */
.person > div{ min-width: 0; }           /* allow ellipsis inside */
.person .name, .person .muted{ max-width: 100%; }

/* ensure the title area clamps nicely within the fixed row height */
.title-sub{ min-width: 0; }              /* allow inner truncation */
.title-sub .title{ line-height: 1.2; }   /* tighter lines for 2-line clamp */







/* ====== Details Card Header (title + button) ====== */
.opp-details-card { }
.opp-details-bar{
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; margin-bottom:12px;
}

/* ====== Details Header Bar (Subject + Status Badge) ====== */
.details-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.details-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ====== Title Section ====== */
.details-title-section {
  margin-bottom: -10px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}

.details-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 1px;
}

.details-subject {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: 8px;
}

.details-id {
  color: #3b82f6;
  font-size: 14px;
  font-weight: 500;
  // margin-bottom: 1px;
}

/* Status Badge Styles */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
}

.status-badge.badge-high {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.badge-medium {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.badge-low {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge.badge-critical {
  background: #fecaca;
  color: #7f1d1d;
}

/* Open status badge (green) */
.status-badge.badge-open {
  background: #dcfce7;
  color: #166534;
}

/* Closed status badge (red) */
.status-badge.badge-closed {
  background: #fee2e2;
  color: #991b1b;
}

/* ====== Details Grid (tile style) ====== */
.details-grid{
  display:grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

/* Each grid cell (tile) */
.details-item{
  display:flex;
  flex-direction:column;
  gap:4px;
  padding:10px 12px;
  border:1px solid var(--line);
  border-radius:8px;
  background:#f8fafc;
  min-height: 0;
}

.details-label{
  color:#64748b;
  font-weight: 600;
  font-size:12px;
  line-height: 1.2;
}

.details-value{
  color:#0f172a;
  font-weight: 700;
  line-height: 1.2;
}

/* Multi-line values (like Customer) must wrap nicely without pushing the other column down */
.details-value.wrap{
  white-space: normal;
  word-break: break-word;
}

/* Numerics right aligned, tabular-nums for even columns */
.details-value.num{
  
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

/* Dates slightly thicker for emphasis */
.details-value.date{
  font-weight: 700;
}

/* Responsive: stack to single column on smaller widths */
@media (max-width: 992px){
  .details-grid{
    grid-template-columns: 1fr;
  }
}

/* Optional: keep the button from jumping when the content wraps */
@media (max-width: 460px){
  .opp-details-bar{
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

/* ====== Details Header Top - Subject + Amount ====== */
.details-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 12px;
}

.details-subject-area {
  flex: 1;
  min-width: 0;
}

.details-subject {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  line-height: 1.4;
  word-break: break-word;
}

.details-amount-area {
  text-align: right;
  flex-shrink: 0;
}

.details-amount-label {
  color: #64748b;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
  margin-bottom: 6px;
}

.details-amount-value {
  color: #0f172a;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.4;
}

.details-id-section {
  padding-bottom: 12px;
  margin-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.details-id {
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
}

/* ====== New 2-Column Details Layout ====== */
.details-grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px 24px;
  padding: 16px 0;
}

.details-grid-3col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px 24px;
  padding: 16px 0;
}

.details-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.details-col:nth-child(3) {
  /* Third column - force left alignment */
  text-align: left !important;
}

.details-col:nth-child(3) .details-value {
  text-align: left !important;
}

.details-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.details-field .details-label {
  color: #64748b;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.details-field .details-value {
  color: #0f172a;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
  text-align: left !important;
}

.details-field .details-value.wrap {
  white-space: normal;
  word-break: break-word;
}

.details-field .details-value.amount-value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  text-align: left !important;
}

/* Responsive: stack to single column on smaller widths */
@media (max-width: 992px) {
  .details-grid-2col {
    grid-template-columns: 1fr;
    gap: 16px 16px;
  }
  .details-grid-3col {
    
    grid-template-columns: 1fr;
    gap: 16px 16px;
    
  }
}





/* Line items table styling */
#line-items{ width:100%; border-collapse:collapse; table-layout:fixed; min-width:980px; }
#line-items th:nth-child(1){ width:320px; }
#line-items th:nth-child(2){ width:150px; }
#line-items th:nth-child(3){ width:50px; }
#line-items th:nth-child(4){ width:150px; }
#line-items th:nth-child(5){ width:150px; }
#line-items th:nth-child(6){ width:100px; }
#line-items th:nth-child(7){ width:100px; }
#line-items th:nth-child(8){ width:100px; }
#line-items thead th{
  position:sticky; top:0; z-index:2;
  background:#f8fafc; color:#64748b; font-weight:700;
  text-transform:uppercase; font-size:11px; letter-spacing:.04em;
  border-bottom:1px solid var(--line);
}
#line-items tbody td{
  padding:10px 12px;
  border-bottom:1px solid var(--line);
  vertical-align:middle;
}
#line-items thead th:nth-child(3),
#line-items thead th:nth-child(4),
#line-items thead th:nth-child(5),
#line-items tbody td.line-items-center{
  text-align:center;
  font-variant-numeric: tabular-nums;
}
#line-items tbody tr:last-child td{ border-bottom:none; }

.line-item-title .name{ font-weight:600; color:#0f172a; }
.line-item-title .sub{ font-size:12px; color:#94a3b8; margin-top:2px; }

/* Sticky header and 2-axis scroll */
.line-items-wrap{ overflow-x:auto; overflow-y:hidden; }
.line-items-wrap.scrolling{ max-height:270px; overflow-y:auto; }






    </style>

    <div class="opp-wrap container-fluid">
      <div class="opp-header">
        <h2 class="opp-title">Opportunities</h2>
        <nav class="opp-breadcrumbs">
          <span></span><span class="chev">›</span><span>CRM</span><span class="chev">›</span>
          <span class="crumb current">Opportunities</span>
        </nav>
      </div>

      <!-- Toolbar -->
      <div class="opp-toolbar card">
        <div class="toolbar-row">
          <div class="search-box">
            <span class="icon">🔍</span>
            <input id="opp-search" type="text" placeholder="Search opportunity…" />
          </div>

          <div class="toolbar-right">
            <span class="filter-label">Filter By:</span>

            <div class="filter">
              <button class="btn dd" data-dd="stage-dd">
                <span>Stage</span><span class="caret">▾</span>
              </button>
              <div id="stage-dd" class="dropdown">
                <button data-value="">All</button>
                <button data-value="Initial Analysis">Initial Analysis</button>
                <button data-value="POC/Demos/Webinar/Session">POC/Demos/Webinar/Session</button>
                <button data-value="Proposal">Proposal</button>
                <button data-value="Qualification">Qualification</button>
                <button data-value="Negotiation">Negotiation</button>
                <button data-value="Order Committed">Order Committed</button>
                <button data-value="Closed Won">Closed Won</button>
                <button data-value="Closed Lost">Closed Lost</button>
                <button data-value="Dead">Dead</button>
              </div>
            </div>

            <div class="filter">
              <button class="btn dd" data-dd="status-dd">
                <span>Status</span><span class="caret">▾</span>
              </button>
              <div id="status-dd" class="dropdown">
                <button data-value="">All</button>
                <button data-value="Open">Open</button>
                <button data-value="Partially Closed">Partially Closed</button>
                <button data-value="Closed">Closed</button>
                <button data-value="In Progress">In Progress</button>
              </div>
            </div>

            

            

            <button class="btn ghost"><span>⋮</span></button>
          </div>
        </div>
      </div>

      <div class="row g-3 equal-row">
        <!-- Section 1: List -->
        <div id="sec-list" class="col-12 anchor-offset">
          <div class="card h-100">
            <div class="card-body">
              <div class="table-responsive list-pane-scroll">
                <table class="opp-table" id="opp-table">
                  <thead>
                    <tr>
                    
<th style="width:42px">
      <input type="checkbox" id="opp-select-all" aria-label="Select all rows"/>
    </th>

                      <th>ID</th>
                      <th>Subject</th>
                      <th>Value (INR)</th>
                      
                      <th>Stage</th>
                      <th>Closure Date</th>
                     <th>Sales Person</th>
                      
                      
                      
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
              
              <!-- Page Size and Load More Controls -->
              <div class="card-footer border-0 list-paging-bar">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="list-paging-area d-flex justify-content-between align-items-center w-100">
                    <div class="p-2">
                      <div class="btn-group">
                        <button type="button" class="btn btn-default btn-sm btn-paging" data-value="20">20</button>
                        <button type="button" class="btn btn-default btn-sm btn-paging" data-value="50">50</button>
                        <button type="button" class="btn btn-default btn-sm btn-paging" data-value="100">100</button>
                        <button type="button" class="btn btn-default btn-sm btn-paging" data-value="500">500</button>
                        <button type="button" class="btn btn-default btn-sm btn-paging" data-value="1500">1500</button>
                      </div>
                    </div>
                    
                    <div class="p-2">
                      <button class="btn btn-default btn-load-more btn-sm">Load More</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2: Details & Insights -->
        <div id="sec-details" class="col-lg-9 col-md-8 anchor-offset" style="display:none">
          <div class="card mb-3">
            <div class="card-body">
              <div id="opp-details" class="small text-muted">
                Select an opportunity from the left to view details.
              </div>
            </div>
          </div>

          <div class="card m-0">
            <div class="card-body">
              <div class="table-responsive line-items-wrap scrolling">
                <table class="table table-sm" id="line-items">
                  <thead class="table-light">
                    <tr>
                      <th>Item Name</th>
                      <th>Brand</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Amount</th>
                      <th>Sales Stage</th>
                      <th>Opportunity Type</th>
                      <th>Renewal ID</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="col-md-6">
              <div class="card mb-3">
                <div class="card-body">
                  <h6>Brand-wise Value</h6>
                  <div id="brand-pie"></div>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="card mb-3">
                <div class="card-body">
                  <h6>Profit Split</h6>
                  <div id="profit-pie"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <h6>Activity Summary</h6>
              <button id="show-activity-btn" class="btn btn-sm btn-outline-primary mt-3">
          View Activity
        </button>
        </div>
              
              <!-- Tabs (same style as Section 3) -->
              <ul id="activity-summary-tabs" class="activity-tabs">
                <li>
                  <a href="#" class="tab-btn active" data-type="call" aria-selected="true">
                    <span class="ico">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.32 1.7.59 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.58a2 2 0 0 1 2.11-.45c.8.27 1.64.47 2.5.59A2 2 0 0 1 22 16.92z"/>
                      </svg>
                    </span>
                    <span>Call</span>
                  </a>
                </li>
                <li>
                  <a href="#" class="tab-btn" data-type="event">
                    <span class="ico">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                    </span>
                    <span>Appointment</span>
                  </a>
                </li>
                <li>
                  <a href="#" class="tab-btn" data-type="task">
                    <span class="ico">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 11l3 3L22 4"></path>
                        <rect x="2" y="7" width="14" height="14" rx="2" ry="2"></rect>
                      </svg>
                    </span>
                    <span>Notes</span>
                  </a>
                </li>
              </ul>

              <!-- Per-tab content with recent lists & forms -->
              <div id="activity-summary-tab-content" class="mb-3">
                <!-- Calls Panel -->
                <div data-panel="call">
                  <div class="small text-muted mb-2">Recent Calls</div>
                  <ul class="list-group small" id="summary-calls-list"></ul>
                  
                  <!-- Create Form -->
                  <form id="summary-call-form" class="mt-3">
                    <div class="mb-2">
                      <label class="form-label">Date / Time</label>
                      <input type="datetime-local" name="when" class="form-control">
                    </div>
                    <div class="mb-2">
                      <label class="form-label">Assignee / Owner</label>
                      <input type="text" name="owner" class="form-control" placeholder="user@example.com">
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Notes</label>
                      <textarea name="notes" rows="3" class="form-control" placeholder="Call notes"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Save Call</button>
                  </form>
                </div>

                <!-- Appointments Panel -->
                <div data-panel="event" class="d-none">
                  <div class="small text-muted mb-2">Upcoming Appointments</div>
                  <ul class="list-group small" id="summary-appointments-list"></ul>
                  
                  <!-- Create Form -->
                  <form id="summary-appointment-form" class="mt-3">
                    <div class="mb-2">
                      <label class="form-label">Date / Time</label>
                      <input type="datetime-local" name="when" class="form-control">
                    </div>
                    <div class="mb-2">
                      <label class="form-label">Assignee / Owner</label>
                      <input type="text" name="owner" class="form-control" placeholder="user@example.com">
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Notes</label>
                      <textarea name="notes" rows="3" class="form-control" placeholder="Appointment details"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Save Appointment</button>
                  </form>
                </div>

                <!-- Notes Panel -->
                <div data-panel="task" class="d-none">
                  <div class="small text-muted mb-2">All Notes</div>
                  <ul class="list-group small" id="summary-notes-list"></ul>
                  
                  <!-- Create Form -->
                  <form id="summary-note-form" class="mt-3">
                    <div class="mb-2">
                      <label class="form-label">Date / Time</label>
                      <input type="datetime-local" name="when" class="form-control">
                    </div>
                    <div class="mb-2">
                      <label class="form-label">Assignee / Owner</label>
                      <input type="text" name="owner" class="form-control" placeholder="user@example.com">
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Notes</label>
                      <textarea name="notes" rows="3" class="form-control" placeholder="Note content"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Save Note</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 3: Activity -->
        <div id="sec-activity" class="col-lg-3 anchor-offset" style="display:none">
          <div class="card h-100">
            <div class="card-body">
              

              <!-- Tabs -->
              <!-- Tabs (screenshot-style) -->
<ul id="activity-tabs" class="activity-tabs">
  <li>
    <a href="#" class="tab-btn active" data-type="call" aria-selected="true">
      <span class="ico">
        <!-- phone outline -->
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.32 1.7.59 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.58a2 2 0 0 1 2.11-.45c.8.27 1.64.47 2.5.59A2 2 0 0 1 22 16.92z"/>
        </svg>
      </span>
      <span>Call</span>
    </a>
  </li>
  <li>
    <a href="#" class="tab-btn" data-type="event">
      <span class="ico">
        <!-- calendar outline -->
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </span>
      <span>Appointment</span>
    </a>
  </li>
  <li>
    <a href="#" class="tab-btn" data-type="task">
      <span class="ico">
        <!-- check-square outline -->
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4"></path>
          <rect x="2" y="7" width="14" height="14" rx="2" ry="2"></rect>
        </svg>
      </span>
      <span>Task</span>
    </a>
  </li>
  
</ul>

              <!-- Per-tab recent lists -->
              <div id="activity-tab-content" class="mb-3">
                <div data-panel="call">
                  <div class="small text-muted mb-2">Recent Calls</div>
                  <ul class="list-group small" id="recent-calls"></ul>
                </div>
                <div data-panel="event" class="d-none">
                  <div class="small text-muted mb-2">Upcoming Appointments</div>
                  <ul class="list-group small" id="recent-events"></ul>
                </div>
                <div data-panel="task" class="d-none">
                  <div class="small text-muted mb-2">Recent Tasks</div>
                  <ul class="list-group small" id="recent-tasks"></ul>
                </div>
                <div data-panel="email" class="d-none">
                  <div class="small text-muted mb-2">Recent Emails</div>
                  <ul class="list-group small" id="recent-emails"></ul>
                </div>
              </div>

              <!-- Create form -->
              <form id="activity-form">
                <div class="mb-2">
                  <label class="form-label">Date / Time</label>
                  <input type="datetime-local" name="when" class="form-control">
                </div>
                <div class="mb-2">
                  <label class="form-label">Assignee / Owner</label>
                  <input type="text" name="owner" class="form-control" placeholder="user@example.com">
                </div>
                <div class="mb-3">
                  <label class="form-label">Notes</label>
                  <textarea name="notes" rows="4" class="form-control" placeholder="Notes"></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-100">Save</button>
              </form>
              <div id="activity-hint" class="small text-muted mt-2">Creating: Call</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
