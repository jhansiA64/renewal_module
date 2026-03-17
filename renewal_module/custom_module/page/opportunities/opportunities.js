// File: renewal_module/custom_module/page/opportunities/opportunities.js

frappe.provide("renewal_module.ui");

/**
 * CONFIG: Backend API endpoints (unchanged)
 */
const OPPORTUNITY_API = {
  list: "renewal_module.custom_module.page.opportunity_list.opportunity_list.get_opportunity_list",
  detail: "renewal_module.custom_module.page.opportunity_list.opportunity_list.get_opportunity_details",
  activity_list: "renewal_module.custom_module.page.opportunity_list.opportunity_list.get_activity",
  activity_create: "renewal_module.custom_module.page.opportunity_list.opportunity_list.create_activity",
};

/**
 * Single on_page_load handler
 * Page route key MUST be "opportunities"
 */
frappe.pages["opportunities"].on_page_load = function (wrapper) {
  const page_wrapper = $(wrapper).find(".layout-main-section")[0] || wrapper;

  const ensureSupportLayoutLoaded = (cb) => {
    if (typeof loadSupportLayout === "function") return cb();
    frappe.require(
      ["/assets/renewal_module/js/issue_themes/support_layout2.js"],
      () => {
        frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
        setTimeout(cb, 10);
      }
    );
  };

  ensureSupportLayoutLoaded(() => {
    loadSupportLayout(page_wrapper, () => {
      if (!wrapper.__opportunitiesPage) {
        wrapper.__opportunitiesPage = new renewal_module.ui.OpportunitiesPage(page_wrapper);
      }
      wrapper.__opportunitiesPage.render();
    });
  });
};

frappe.pages["opportunities"].on_page_show = function (wrapper) {
  if (wrapper && wrapper.__opportunitiesPage) {
    wrapper.__opportunitiesPage.handleRoute(); // reacts to #opportunities[/<name>]
  }
};

// ================== PAGE CLASS (ONE PAGE, TWO MODES) ==================
renewal_module.ui.OpportunitiesPage = class OpportunitiesPage {
  constructor(wrapper) {
    this.wrapper = wrapper;
    this.page = frappe.ui.make_app_page({
      parent: wrapper,
      title: "Opportunities",
      single_column: true,
    });

    // State
    this.filters = { stage: "", status: "", q: "" };
    this.page_length = 20;
    this.start = 0;
    this.last_fetch_count = 0;
    this.rows_cache = [];
    this.visible_limit = 20;
    this.visible_count = 0;
    this.selected = new Set();

    this.currentOpp = null;
    this.currentType = "call";        // activity tab (right column)
    this.currentSummaryType = "call"; // activity summary tab (left column)
    this._activity_cache = [];
  }

  render() {
    const waitForContent = () => {
      const $content = $("#support-page-content");
      if (!$content.length) return setTimeout(waitForContent, 40);

      // Mount the page template (3 sections: list, detail-left, detail-right)
      $content.empty().append(frappe.opportunities_page_template.body);

      // Cache elements, bind events, and load list
      this.cacheDom($content);
      this.bind();

      // Start in LIST mode; handleRoute will flip to detail if URL has name
      this.setLayout("list");
      this.setActiveSidebar();
      this.load_opportunities(true);
      this.handleRoute();
    };
    waitForContent();
  }

  // -------------------- Cache DOM --------------------
  cacheDom($root) {
    this.$root = $root;

    // Sections (IMPORTANT: no col-* classes preset in HTML)
    this.$secList = $root.find("#sec-list");                    // full-width list
    this.$secDetailLeft = $root.find("#sec-detail-left");       // details (col-8)
    this.$secDetailRight = $root.find("#sec-detail-right");     // activity (col-4)

    // List & toolbar
    this.$tableBody = $root.find("#opp-table tbody");
    this.$selectAll = $root.find("#opp-select-all");
    this.$search = $root.find("#opp-search");

    this.$ddStage = $root.find("#stage-dd");
    this.$ddStatus = $root.find("#status-dd");
    this.$btnStage = $root.find('[data-dd="stage-dd"]');
    this.$btnStatus = $root.find('[data-dd="status-dd"]');

    // Details (left)
    this.$details = $root.find("#opp-details");
    this.$items = $root.find("#line-items tbody");
    this.$brandPie = $root.find("#brand-pie");
    this.$profitPie = $root.find("#profit-pie");

    // Details Activity Summary (left)
    this.$activitySummaryTabs = $root.find("#activity-summary-tabs a");
    this.$activitySummaryPanels = $root.find("#activity-summary-tab-content [data-panel]");
    this.$summaryCallsList = $root.find("#summary-calls-list");
    this.$summaryAppointmentsList = $root.find("#summary-appointments-list");
    this.$summaryNotesList = $root.find("#summary-notes-list");
    this.$summaryCallForm = $root.find("#summary-call-form");
    this.$summaryAppointmentForm = $root.find("#summary-appointment-form");
    this.$summaryNoteForm = $root.find("#summary-note-form");
    this.$backToList = $root.find("#back-to-list");

    // Activity (right)
    this.$tabs = $root.find("#activity-tabs a");
    this.$tabPanels = $root.find("#activity-tab-content [data-panel]");
    this.$form = $root.find("#activity-form");
    this.$hint = $root.find("#activity-hint");

    this.$recentCalls = $root.find("#recent-calls");
    this.$recentEvents = $root.find("#recent-events");
    this.$recentTasks = $root.find("#recent-tasks");
    this.$recentEmails = $root.find("#recent-emails");
  }

  // -------------------- Bind events --------------------
  bind() {
    // Dropdown toggles
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
        this.applyFilters();
      });
    };
    bindPick(this.$ddStage, "stage", this.$btnStage);
    bindPick(this.$ddStatus, "status", this.$btnStatus);

    // Search
    this.$search.on(
      "input",
      frappe.utils.debounce(() => {
        this.filters.q = (this.$search.val() || "").trim().toLowerCase();
        this.reloadList();
      }, 250)
    );

    // Page size buttons
    this.$root.find(".btn-paging").on("click", (e) => {
      const $btn = $(e.currentTarget);
      const value = parseInt($btn.data("value"), 10) || 20;
      this.page_length = value;
      this.$root.find(".btn-paging").removeClass("active");
      $btn.addClass("active");
      this.reloadList();
    });
    this.$root.find('.btn-paging[data-value="20"]').addClass("active");

    // Load more
    this.$root.find(".btn-load-more").on("click", () => {
      this.load_opportunities(false);
    });

    // Row click → go to DETAIL mode (same page)
    this.$tableBody.on("click", "tr[data-name]", (e) => {
      const name = e.currentTarget.getAttribute("data-name");
      if (!name) return;
      frappe.set_route("opportunities", name); // triggers handleRoute → setLayout("detail")
    });

    // Selection in list
    this.$tableBody.on("click", "input.opp-row-chk", (e) => e.stopPropagation());
    this.$tableBody.on("change", "input.opp-row-chk", (e) => {
      const name = e.currentTarget.getAttribute("data-name");
      if (!name) return;
      if (e.currentTarget.checked) this.selected.add(name);
      else this.selected.delete(name);
      this.updateSelectAllState();
    });
    this.$selectAll.on("change", (e) => {
      const checked = e.currentTarget.checked;
      this.$tableBody.find("tr[data-name]").each((_, tr) => {
        const name = tr.getAttribute("data-name");
        if (!name) return;
        const $chk = $(tr).find("input.opp-row-chk");
        $chk.prop("checked", checked);
        if (checked) this.selected.add(name);
        else this.selected.delete(name);
      });
      this.updateSelectAllState();
    });

    // Back to LIST
    this.$backToList.on("click", (e) => {
      e.preventDefault();
      frappe.set_route("opportunities"); // triggers setLayout("list")
    });

    // Activity (right) tabs
    this.$tabs.on("click", (e) => {
      e.preventDefault();
      const $a = $(e.currentTarget);
      const t = $a.data("type");
      this.$tabs.removeClass("active");
      $a.addClass("active");
      this.currentType = t;
      this.$hint.text(`Creating: ${this.label_for_type(this.currentType)}`);
      this.$tabPanels.addClass("d-none");
      this.$tabPanels.filter(`[data-panel="${t}"]`).removeClass("d-none");
      if (this.currentOpp) this.populate_recent_by_type(t);
    });

    // Activity (right) create form
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

    // Details Activity Summary (left) tabs
    this.$activitySummaryTabs.on("click", (e) => {
      e.preventDefault();
      const $a = $(e.currentTarget);
      const t = $a.data("type");
      this.$activitySummaryTabs.removeClass("active");
      $a.addClass("active");
      this.currentSummaryType = t;
      this.$activitySummaryPanels.addClass("d-none");
      this.$activitySummaryPanels.filter(`[data-panel="${t}"]`).removeClass("d-none");
      if (this.currentOpp) this.populate_summary_by_type(t);
    });

    // Details Activity Summary (left) forms
    const createFromSummary = (payload, $form) => {
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
    };

    this.$summaryCallForm.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) return;
      createFromSummary({
        type: "call",
        opportunity: this.currentOpp.name,
        when: this.$summaryCallForm.find('[name="when"]').val(),
        owner: this.$summaryCallForm.find('[name="owner"]').val(),
        notes: this.$summaryCallForm.find('[name="notes"]').val(),
      }, this.$summaryCallForm);
    });

    this.$summaryAppointmentForm.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) return;
      createFromSummary({
        type: "event",
        opportunity: this.currentOpp.name,
        when: this.$summaryAppointmentForm.find('[name="when"]').val(),
        owner: this.$summaryAppointmentForm.find('[name="owner"]').val(),
        notes: this.$summaryAppointmentForm.find('[name="notes"]').val(),
      }, this.$summaryAppointmentForm);
    });

    this.$summaryNoteForm.on("submit", (e) => {
      e.preventDefault();
      if (!this.currentOpp) return;
      createFromSummary({
        type: "task",
        opportunity: this.currentOpp.name,
        when: this.$summaryNoteForm.find('[name="when"]').val(),
        owner: this.$summaryNoteForm.find('[name="owner"]').val(),
        notes: this.$summaryNoteForm.find('[name="notes"]').val(),
      }, this.$summaryNoteForm);
    });
  }

  // -------------------- Route handler (one page, two modes) --------------------
  handleRoute() {
    const route = frappe.get_route(); // ["opportunities"] or ["opportunities", "<name>"]
    const name = route[1];

    if (!name) {
      // LIST mode
      this.currentOpp = null;
      this.setLayout("list");
      return;
    }

    // DETAIL mode
    if (!this.currentOpp || this.currentOpp.name !== name) {
      this.load_details(name); // includes activity + summary
    }
    this.setLayout("detail");
  }

  // -------------------- Layout manager --------------------
  setLayout(mode) {
    if (mode === "list") {
      // Hide detail columns
      this.$secDetailLeft.hide().removeClass();
      this.$secDetailRight.hide().removeClass();

      // Show list as full width
      this.$secList
        .show()
        .removeClass()
        .addClass("col-12 fade-in");
      return;
    }

    if (mode === "detail") {
      // Hide list completely
      this.$secList.hide().removeClass();

      // Show details (8) + activity (4)
      this.$secDetailLeft
        .show()
        .removeClass()
        .addClass("col-lg-8 fade-in");
      this.$secDetailRight
        .show()
        .removeClass()
        .addClass("col-lg-4 fade-in");
    }
  }

  // -------------------- List data --------------------
  reloadList() {
    this.start = 0;
    this.rows_cache = [];
    this.visible_limit = this.page_length;
    this.last_fetch_count = 0;
    this.load_opportunities(true);
  }

  load_opportunities(reset = true) {
    if (reset) {
      this.$tableBody.html(`
        <tr><td colspan="10" class="text-muted small py-3">${__("Loading opportunities…")}</td></tr>
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
        const newRows = Array.isArray(r.message) ? r.message : [];
        this.last_fetch_count = newRows.length;
        this.rows_cache = reset ? newRows : this.rows_cache.concat(newRows);
        this.start += newRows.length;
        this.applyFilters();
      },
    });
  }

  applyFilters() {
    const f = this.filters;
    const q = (f.q || "").toLowerCase();

    const filtered = this.rows_cache.filter((row) => {
      const stage = (row.sales_stage || row.stage || row.status || "").trim();
      const status = (row.status || "").trim();

      const textBits = [
        row.name, row.title, row.subject, row.company, row.customer_name, row.party_name,
        row.contact_person_name, row.contact_person, row.contact_email,
        row.owner_full_name, row.owner, row.lead_source, row.source
      ].filter(Boolean).join(" ").toLowerCase();

      let ok = true;
      if (f.stage && f.stage !== stage) ok = false;
      if (f.status && f.status !== status) ok = false;
      if (q && !textBits.includes(q)) ok = false;
      return ok;
    });

    const displayRows = filtered.slice(0, this.visible_limit);
    this.visible_count = displayRows.length;
    this.render_rows(displayRows);
    this.updateLoadMoreVisibility(filtered.length);
  }

  render_rows(rows) {
    this.$tableBody.empty();

    if (!rows.length) {
      this.$tableBody.append(`
        <tr><td colspan="10" class="text-muted small py-3">${__("No opportunities found")}</td></tr>
      `);
      this.updateSelectAllState();
      this.updateLoadMoreVisibility(1);
      return;
    }

    rows.forEach((row) => {
      const id = frappe.utils.escape_html(row.name || "");
      const title   = frappe.utils.escape_html(row.title || row.subject || "");
      const company = frappe.utils.escape_html(row.company || row.customer_name || row.party_name || "");
      const amount  = frappe.format(row.opportunity_amount, { fieldtype: "Currency" });
      const stage   = frappe.utils.escape_html(row.sales_stage || row.stage || row.status || "");
      const close_date = frappe.format(row.expected_closing, { fieldtype: "Date" });

      const salesperson_name  = frappe.utils.escape_html(row.sales_person_name || row.owner_full_name || row.owner || "");
      const salesperson_email = frappe.utils.escape_html(row.sales_person_email || row.owner_email || "");
      const avatar_txt        = this.initials(salesperson_name || salesperson_email || title);

      const $tr = $(`
        <tr class="opp-row" data-name="${id}" style="cursor:pointer">
          <td><input type="checkbox" class="opp-row-chk" data-name="${id}" aria-label="Select row ${id}"/></td>
          <td>${id}</td>
          <td>
            <div class="title-sub">
              <div>
                <div class="title truncate-2">${title}</div>
                <div class="sub truncate-1">${company ? "by " + company : ""}</div>
              </div>
            </div>
          </td>
          <td class="num">${amount || ""}</td>
          <td>${this.stageForStatus(stage)}</td>
          <td>${close_date || ""}</td>
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

      if (this.selected.has(id)) $tr.find('input.opp-row-chk').prop('checked', true);

      $tr.attr("tabindex", 0).on("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); $tr.trigger("click"); }
      });

      this.$tableBody.append($tr);
    });

    this.updateSelectAllState();
  }

  updateLoadMoreVisibility(totalFiltered) {
    const $loadMore = this.$root.find(".btn-load-more");
    const total = typeof totalFiltered === "number" ? totalFiltered : this.visible_count;
    const hasMoreLocal = total > this.visible_count;
    const hasMoreServer = this.last_fetch_count === this.page_length;
    if (this.visible_count > 0 && (hasMoreLocal || hasMoreServer)) $loadMore.show();
    else $loadMore.hide();
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
      if (name && this.selected.has(name)) selectedOnPage++;
    });
    if (selectedOnPage === 0) this.$selectAll.prop('checked', false).prop('indeterminate', false);
    else if (selectedOnPage === $rows.length) this.$selectAll.prop('checked', true).prop('indeterminate', false);
    else this.$selectAll.prop('checked', false).prop('indeterminate', true);
  }

  // -------------------- Detail + Activity --------------------
  load_details(opp_name) {
    this.currentOpp = { name: opp_name };

    // Left: skeletons
    this.$details.html(`<span class="text-muted">${__("Loading details…")}</span>`);
    this.$items.empty();
    this.$brandPie.empty();
    this.$profitPie.empty();

    // Summary skeletons
    this.$summaryCallsList.empty().append(`<li class="list-group-item text-muted small">${__("Loading...")}</li>`);
    this.$summaryAppointmentsList.empty().append(`<li class="list-group-item text-muted small">${__("Loading...")}</li>`);
    this.$summaryNotesList.empty().append(`<li class="list-group-item text-muted small">${__("Loading...")}</li>`);

    // Right: skeletons
    this.$recentCalls.empty().append(`<li class="list-group-item text-muted small">${__("Loading...")}</li>`);
    this.$recentEvents.empty();
    this.$recentTasks.empty();
    this.$recentEmails.empty();

    // Details
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
      },
    });

    // Activity
    this.load_activity(opp_name);
  }

  render_details(d) {
    const stageBadgeHtml = this.getStatusBadge(d.sales_stage || "");
    const html = `
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
        <div class="details-col">
          <div class="details-field"><div class="details-label">${__("CUSTOMER")}</div><div class="details-value">${frappe.utils.escape_html(d.party_name || d.customer_name || "")}</div></div>
          <div class="details-field"><div class="details-label">${__("OWNER")}</div><div class="details-value">${frappe.utils.escape_html(d.owner_full_name || d.owner || "")}</div></div>
        </div>
        <div class="details-col">
          <div class="details-field"><div class="details-label">${__("STATUS")}</div><div class="details-value">${frappe.utils.escape_html(d.status || "")}</div></div>
          <div class="details-field"><div class="details-label">${__("EXPECTED CLOSURE DATE")}</div><div class="details-value">${frappe.format(d.expected_closing, { fieldtype: "Date" })}</div></div>
        </div>
        <div class="details-col">
          <div class="details-field"><div class="details-label">${__("CONTACT PERSON")}</div><div class="details-value">${frappe.utils.escape_html(d.contact_display || "")}</div></div>
          <div class="details-field"><div class="details-label">${__("MOBILE")}</div><div class="details-value">${frappe.utils.escape_html(d.contact_mobile || "")}</div></div>
        </div>
      </div>
    `;
    this.$details.html(html);
  }

  render_items(items) {
    this.$items.empty();
    if (!items.length) {
      this.$items.append(`<tr><td colspan="8" class="text-muted small">${__("No line items")}</td></tr>`);
      return;
    }
    items.forEach((it) => {
      const qty    = frappe.format(it.qty,    { fieldtype: "Float" });
      const rate   = frappe.format(it.rate,   { fieldtype: "Currency" });
      const amount = frappe.format(it.amount, { fieldtype: "Currency" });
      const itemName = frappe.utils.escape_html(it.item_name || it.item_code || "");
      const itemSub = frappe.utils.escape_html(
        (it.item_name && it.item_code && it.item_name !== it.item_code ? it.item_code : "") ||
        it.description || ""
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
      data: { labels: brand_pie.labels || [], datasets: [{ values: brand_pie.values || [] }] },
    });

    new frappe.Chart("#profit-pie", {
      ...common,
      data: { labels: profit_pie.labels || [], datasets: [{ values: profit_pie.values || [] }] },
    });
  }

  load_activity(opp_name) {
    frappe.call({
      method: OPPORTUNITY_API.activity_list,
      args: { name: opp_name },
      callback: (r) => {
        const items = r.message || [];
        this._activity_cache = items;
        // Left: summary lists
        this.populate_summary_by_type(this.currentSummaryType);
        // Right: recent lists
        this.populate_recent_by_type(this.currentType);
      },
    });
  }

  populate_summary_by_type(t) {
    // clear
    this.$summaryCallsList.empty();
    this.$summaryAppointmentsList.empty();
    this.$summaryNotesList.empty();

    if (!this._activity_cache || !this._activity_cache.length) {
      this.$summaryCallsList.append(`<li class="list-group-item text-muted small">${__("No calls yet")}</li>`);
      this.$summaryAppointmentsList.append(`<li class="list-group-item text-muted small">${__("No appointments yet")}</li>`);
      this.$summaryNotesList.append(`<li class="list-group-item text-muted small">${__("No notes yet")}</li>`);
      return;
    }

    const typeMap = {
      call:  (x) => (x.type || "").toLowerCase() === "phone" || (x.type || "").toLowerCase() === "call",
      event: (x) => (x.type || "").toLowerCase() === "appointment" || (x.type || "").toLowerCase() === "event",
      task:  (x) => (x.type || "").toLowerCase() === "task" || (x.type || "").toLowerCase() === "note",
    };
    const listByType = {
      call: this.$summaryCallsList,
      event: this.$summaryAppointmentsList,
      task: this.$summaryNotesList,
    };
    const list = listByType[t];
    const items = this._activity_cache.filter(typeMap[t] || (() => false));

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

    if (!items.length) {
      list.append(`<li class="list-group-item text-muted small">${__("No items")}</li>`);
    } else {
      items.slice(0, 10).forEach((x) => list.append(renderItem(x)));
    }
  }

  populate_recent_by_type(t) {
    this.$recentCalls.empty();
    this.$recentEvents.empty();
    this.$recentTasks.empty();
    this.$recentEmails.empty();

    if (!this._activity_cache || !this._activity_cache.length) {
      this.$recentCalls.append(`<li class="list-group-item text-muted small">No calls</li>`);
      this.$recentEvents.append(`<li class="list-group-item text-muted small">No appointments</li>`);
      this.$recentTasks.append(`<li class="list-group-item text-muted small">No tasks</li>`);
      this.$recentEmails.append(`<li class="list-group-item text-muted small">No emails</li>`);
      return;
    }

    const typeMap = {
      call:  (x) => (x.type || "").toLowerCase() === "phone" || (x.type || "").toLowerCase() === "call",
      event: (x) => (x.type || "").toLowerCase() === "appointment" || (x.type || "").toLowerCase() === "event",
      task:  (x) => (x.type || "").toLowerCase() === "task",
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

  // -------------------- Utilities --------------------
  label_for_type(t) {
    return ({ call: "Call", event: "Appointment", task: "Task", email: "Email" }[t] || t);
  }
  initials(name) {
    const n = (name || "").trim();
    if (!n) return "U";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map(s => s[0]?.toUpperCase() || "").join("") || "U";
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
  getStatusBadge(status) {
    if (!status) return "";
    const s = (status || "").toLowerCase();
    let badgeClass = "badge-medium";
    if (s === "high") badgeClass = "badge-high";
    else if (s === "low") badgeClass = "badge-low";
    else if (s === "critical") badgeClass = "badge-critical";
    else if (s === "open" || s.includes("initial") || s.includes("prospecting")) badgeClass = "badge-open";
    else if (s === "closed lost" || s === "cancelled" || s === "lost") badgeClass = "badge-closed";
    else if (s === "closed won" || s === "won") badgeClass = "badge-open";
    else if (s.includes("negotiation") || s.includes("proposal")) badgeClass = "badge-medium";
    return `<span class="status-badge ${badgeClass}">${frappe.utils.escape_html(status)}</span>`;
  }

  setActiveSidebar() {
    const route = frappe.get_route();
    const baseRoute = route[0]; // "opportunities"
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
};

// ================== TEMPLATE (List + Detail 8/4) ==================
frappe.opportunities_page_template = {
  body: `
    <style>
      .fade-in { animation: fadeIn .18s ease-in; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
      .list-pane-scroll{ max-height: calc(100vh - 280px); overflow:auto; }
      .anchor-offset { scroll-margin-top: 90px; }

      /* Badges & pills (as you had) */
      .pill{padding:3px 8px;border-radius:999px;font-weight:700;font-size:11px;display:inline-block}
      .pill-won{background:#ecfdf5;color:#16a34a;border:1px solid #4aa56a}
      .pill-inprogress{background:#fff7ed;color:#d97706;border:1px solid #eed202}
      .pill-closed{background:#fef2f2;color:#dc2626;border:1px solid #eb4a4a}
      .pill-negotiation{background:#eff6ff;color:#2563eb;border:1px solid #1f0e5f}
      .status-badge{display:inline-flex;align-items:center;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap}
      .status-badge.badge-open{background:#dcfce7;color:#166534}
      .status-badge.badge-closed{background:#fee2e2;color:#991b1b}
      .status-badge.badge-medium{background:#fef3c7;color:#92400e}
      .status-badge.badge-high{background:#fee2e2;color:#991b1b}

      .truncate-1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .truncate-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .num{font-variant-numeric:tabular-nums}

      /* Table */
      .opp-table{width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0}
      .opp-table thead th{font-size:14px;font-weight:700;padding:12px 14px;border-bottom:1px solid #e6e9f2;white-space:nowrap}
      .opp-table tbody td{padding:12px 14px;border-bottom:1px solid #e6e9f2;vertical-align:middle}
      .person{display:flex;align-items:center;gap:10px}
      .avatar{width:28px;height:28px;border-radius:50%;background:#e5e7eb;color:#111827;display:grid;place-items:center;line-height:1;font-weight:700;font-size:12px}

      /* Details */
      .details-header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;margin-bottom:12px}
      .details-subject{font-size:18px;font-weight:700;color:#0f172a;margin:0;line-height:1.4;display:flex;gap:8px;align-items:center}
      .details-id{color:#64748b;font-size:12px;font-weight:500}

      /* Line items */
      #line-items{width:100%;border-collapse:collapse;table-layout:fixed;min-width:980px}
      #line-items thead th{position:sticky;top:0;z-index:2;background:#f8fafc;color:#64748b;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.04em;border-bottom:1px solid #e6e9f2}
      #line-items tbody td{padding:10px 12px;border-bottom:1px solid #e6e9f2;vertical-align:middle}
      .line-items-center{text-align:center;font-variant-numeric:tabular-nums}
      .line-item-title .name{font-weight:600;color:#0f172a}
      .line-item-title .sub{font-size:12px;color:#94a3b8;margin-top:2px}

      /* Activity tabs */
      .activity-tabs{display:flex;gap:20px;border-bottom:1px solid #e9edf5;margin-bottom:8px}
      .activity-tabs .tab-btn{padding:8px 0;text-decoration:none;font-weight:600;color:#475569}
      .activity-tabs .tab-btn.active{color:#ef4444;position:relative}
      .activity-tabs .tab-btn.active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#ef4444;border-radius:2px}
    </style>

    <div class="container-fluid">
      <!-- Toolbar -->
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <div class="d-flex align-items-center gap-2" style="border:1px solid #e6e9f2;border-radius:8px;padding:8px 10px;">
              <span>🔍</span>
              <input id="opp-search" type="text" placeholder="Search opportunity…" style="border:none;outline:none;min-width:260px">
            </div>

           

            
          </div>
        </div>
      </div>

      <!-- Three containers (JS will assign col-* at runtime) -->
      <div class="row g-3">
        <!-- List (full-width in LIST mode) -->
        <div id="sec-list" style="">
          <div class="card h-100">
            <div class="card-body">
              <div class="table-responsive list-pane-scroll">
                <table class="opp-table table" id="opp-table">
                  <thead>
                    <tr>
                      <th style="width:42px"><input type="checkbox" id="opp-select-all" aria-label="Select all rows"/></th>
                      <th style="width:80px">ID</th>
                      <th style="width:360px">Subject</th>
                      <th style="width:140px">Value (INR)</th>
                      <th style="width:140px">Stage</th>
                      <th style="width:140px">Closure Date</th>
                      <th style="width:220px">Sales Person</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>

              <div class="card-footer border-0">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="btn-group">
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="20">20</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="50">50</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="100">100</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="500">500</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="1500">1500</button>
                  </div>
                  <button class="btn btn-default btn-load-more btn-sm">Load More</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Details (left, col-8 in DETAIL mode) -->
        <div id="sec-detail-left" style="display:none">
          <div class="d-flex justify-content-between align-items-center mb-2">
            #← Back to List</a>
          </div>

          <div class="card mb-3">
            <div class="card-body">
              <div id="opp-details" class="small text-muted">Select an opportunity to view details.</div>
            </div>
          </div>

          <div class="card mb-3">
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

          <div class="row g-2">
            <div class="col-md-6">
              <div class="card"><div class="card-body">
                <h6>Brand-wise Value</h6>
                <div id="brand-pie"></div>
              </div></div>
            </div>
            <div class="col-md-6">
              <div class="card"><div class="card-body">
                <h6>Profit Split</h6>
                <div id="profit-pie"></div>
              </div></div>
            </div>
          </div>

          <div class="card mt-2">
            <div class="card-body">
              <h6>Activity Summary</h6>
              <ul id="activity-summary-tabs" class="activity-tabs">
                <li>#Call</a></li>
                <li>#Appointment</a></li>
                <li>#Notes</a></li>
              </ul>

              <div id="activity-summary-tab-content">
                <div data-panel="call">
                  <div class="small text-muted mb-2">Recent Calls</div>
                  <ul class="list-group small" id="summary-calls-list"></ul>
                  <form id="summary-call-form" class="mt-3">
                    <div class="mb-2"><label class="form-label">Date / Time</label><input type="datetime-local" name="when" class="form-control"></div>
                    <div class="mb-2"><label class="form-label">Assignee / Owner</label><input type="text" name="owner" class="form-control" placeholder="user@example.com"></div>
                    <div class="mb-3"><label class="form-label">Notes</label><textarea name="notes" rows="3" class="form-control" placeholder="Call notes"></textarea></div>
                    <button type="submit" class="btn btn-primary w-100">Save Call</button>
                  </form>
                </div>

                <div data-panel="event" class="d-none">
                  <div class="small text-muted mb-2">Upcoming Appointments</div>
                  <ul class="list-group small" id="summary-appointments-list"></ul>
                  <form id="summary-appointment-form" class="mt-3">
                    <div class="mb-2"><label class="form-label">Date / Time</label><input type="datetime-local" name="when" class="form-control"></div>
                    <div class="mb-2"><label class="form-label">Assignee / Owner</label><input type="text" name="owner" class="form-control" placeholder="user@example.com"></div>
                    <div class="mb-3"><label class="form-label">Notes</label><textarea name="notes" rows="3" class="form-control" placeholder="Appointment details"></textarea></div>
                    <button type="submit" class="btn btn-primary w-100">Save Appointment</button>
                  </form>
                </div>

                <div data-panel="task" class="d-none">
                  <div class="small text-muted mb-2">All Notes</div>
                  <ul class="list-group small" id="summary-notes-list"></ul>
                  <form id="summary-note-form" class="mt-3">
                    <div class="mb-2"><label class="form-label">Date / Time</label><input type="datetime-local" name="when" class="form-control"></div>
                    <div class="mb-2"><label class="form-label">Assignee / Owner</label><input type="text" name="owner" class="form-control" placeholder="user@example.com"></div>
                    <div class="mb-3"><label class="form-label">Notes</label><textarea name="notes" rows="3" class="form-control" placeholder="Note content"></textarea></div>
                    <button type="submit" class="btn btn-primary w-100">Save Note</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Activity (right, col-4 in DETAIL mode) -->
        <div id="sec-detail-right" style="display:none">
          <div class="card h-100">
            <div class="card-body">
              <ul id="activity-tabs" class="activity-tabs">
                <li>#Call</a></li>
                <li>#Appointment</a></li>
                <li>#Task</a></li>
                <li>#Email</a></li>
              </ul>

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

              <form id="activity-form">
                <div class="mb-2"><label class="form-label">Date / Time</label><input type="datetime-local" name="when" class="form-control"></div>
                <div class="mb-2"><label class="form-label">Assignee / Owner</label><input type="text" name="owner" class="form-control" placeholder="user@example.com"></div>
                <div class="mb-3"><label class="form-label">Notes</label><textarea name="notes" rows="4" class="form-control" placeholder="Notes"></textarea></div>
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