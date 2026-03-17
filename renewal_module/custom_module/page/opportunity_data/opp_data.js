// // frappe.pages['opportunity-data'].on_page_load = function(wrapper) {
// // 	var page = frappe.ui.make_app_page({
// // 		parent: wrapper,
// // 		title: 'None',
// // 		single_column: true
// // 	});
// // }




// frappe.pages['opportunity-data'].on_page_load = function (wrapper) {
//     new opportunitydatapage(wrapper);
// };
 
// frappe.pages['opportunity-data'].on_page_show = function (wrapper) {
//     //console.log("🔄 Tickets page showing", wrapper);
//     console.log("🔄 opportunity-data	 page showing");
//     const pageWrapper = wrapper || $(".page")[0] || document.body;
//     const ensureSupportLayoutLoaded = (cb) => {
//         if (typeof loadSupportLayout === "function") return cb();
//         frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
//             setTimeout(cb, 10);
//         });
//         frappe.require([
//             "/assets/renewal_module/css/sales-dashboard/issue_themes/support_theme2.css"
//         ]);
//     };
//     ensureSupportLayoutLoaded(() => {
//         loadSupportLayout(pageWrapper, () => {
//             if (!frappe.opportunitydata_page || frappe.opportunitydata_page.wrapper !== pageWrapper) {
//                 frappe.opportunitydata_page = new opportunitydatapage(pageWrapper);
//             }
//             frappe.opportunitydata_page.render();
//         });
//     });
// };
 
// class opportunitydatapage {
//     constructor(wrapper) {
//         this.wrapper = wrapper;
//         this.page = frappe.ui.make_app_page({
//             parent: wrapper,
//             title: "Opportunity Data",
//             single_column: true,
//         });
//     }
//     render() {
 
//         const waitForContent = () => {
//             const $content = $("#support-page-content");
//             if (!$content.length) {
//                 // wait until layout injects DOM
//                 setTimeout(waitForContent, 50);
//                 return;
//             }
//             $content.empty().append(frappe.opportunitydata_page_template.body);
//             this.handleRoute();
//         };
 
//         waitForContent();
//     }
 
//     setActiveSidebar() {
//         const route = frappe.get_route();
//         const baseRoute = route[0]; // "opportunity-data"
//         // Reset states
//         $(".side-nav-link").removeClass("active-menu");
//         $(".side-nav-item").removeClass("active-menu-item");
//         $(".menu-parent").removeClass("active");
 
//         // Use data-page for reliable matching
//         $(".side-nav-link[data-page]").each(function () {
//             const linkPage = $(this).data("page");
//             if (!linkPage) return;
 
//             if (linkPage === baseRoute) {
//                 $(this).addClass("active-menu");
//                 const $item = $(this).closest(".side-nav-item");
//                 $item.addClass("active-menu-item");
//                 const $parent = $(this).closest(".menu-parent");
//                 if ($parent.length) {
//                     $parent.addClass("active");
//                     //$parent.children(".sub-menu").slideDown(0);
//                     $parent.closest(".sub-menu").each((idx, el) => {
//                         const $ancestor = $(el).closest(".menu-parent");
//                         if ($ancestor.length) {
//                             $ancestor.addClass("active");
//                         }
//                     });
//                 }
//             }
//         });
//     }
 
//     handleRoute() {
//         this.setActiveSidebar();
//     }
// }
 
// frappe.opportunitydata_page_template = {
//     body: `
//         <div class="opportunity-data-page">
//             <h6>Custom Opportunity Data Page</h6>
//             <p>This is a custom opportunity data page.</p>
//             <!-- Add your opportunity data HTML and JavaScript here -->
//         </div>
//     `
// };























// Page: opportunity-data

frappe.pages['opportunity-data'].on_page_load = function (wrapper) {
  new opportunitydatapage(wrapper);
};

frappe.pages['opportunity-data'].on_page_show = function (wrapper) {
  $('body').attr('data-route', 'opportunity-data');   // ⭐ IMPORTANT FIX ⭐
  
  console.log("🔄 opportunity-data page showing");
  const pageWrapper = wrapper || $(".page")[0] || document.body;

 const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css",
		]);
	};

  ensureSupportLayoutLoaded(() => {
    loadSupportLayout(pageWrapper, () => {
      if (!frappe.opportunitydata_page || frappe.opportunitydata_page.wrapper !== pageWrapper) {
        frappe.opportunitydata_page = new opportunitydatapage(pageWrapper);
      }
      frappe.opportunitydata_page.render();
    });
  });
};

// --- SAFE FORMATTERS ---
function fmt(val, df = {}) {
  // General formatter: falls back gracefully if frappe.format is missing
  if (frappe && typeof frappe.format === "function") {
    return frappe.format(val, df);
  }
  // basic fallback: just stringify
  return (val == null ? "" : String(val));
}

function fmtCurrency(val, currency=null) {
  // Currency formatter with multiple fallbacks
  if (frappe?.utils?.format_currency) {
    return frappe.utils.format_currency(val, currency);
  }
  if (frappe && typeof frappe.format === "function") {
    return frappe.format(val, { fieldtype: "Currency" });
  }
  try {
    return Number(val || 0).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
  } catch {
    return String(val ?? "");
  }
}




// ---- CONFIG ----
const OPP_CFG = {
  ROUTE: "opportunity-data",
  DOCTYPE: "Opportunity",
  TITLE_FIELD: "title",                 // change to "opportunity_name" if you use that
  PARTY_FROM_FIELD: "opportunity_from",
  PARTY_NAME_FIELD: "party_name",
  STATUS_FIELD: "status",
  PROBABILITY_FIELD: "probability",
  AMOUNT_FIELD: "opportunity_amount",
  EXPECTED_CLOSE_FIELD: "expected_closing",
  WORK_OWNER_FIELD: "owner",

  // Back-end endpoints for this page
  API: {
    get_filters: "renewal_module.custom_module.page.opportunity_data.opportunity_data.get_filters",
    get_list_data: "renewal_module.custom_module.page.opportunity_data.opportunity_data.get_list_data",
    get_users_basic_info: "renewal_module.custom_module.page.opportunity_data.opportunity_data.get_users_basic_info"
  },

  // localStorage keys
  LS: {
    page_len: "opportunity_data_page_length",
    last_filters: "opportunity_data_last_filters"
  }
};


// ---- PAGE CLASS ----
class opportunitydatapage {
  constructor(wrapper) {
    this.wrapper = wrapper;
    this.page = frappe.ui.make_app_page({
      parent: wrapper,
      title: "Opportunity Data",
      single_column: true,
    });

    // state
    this.page_length = 20;
    this.visible_count = 0;
    this.total_records = 0;
    this.all_rows = [];
    this.filtered_rows = [];
    this.selected = new Set();

    // active filters
    this.active_status = "";
    this.active_probability = "";
    this.selectedOwners = [];
    this.saved_filters = []; // advanced popover filters (optional)
  }

  render() {
    $('body').attr('data-route', 'opportunity-data');   // ⭐ IMPORTANT FIX ⭐

    const waitForContent = () => {
      const $content = $("#support-page-content");
      if (!$content.length) return setTimeout(waitForContent, 50);
      $content.empty().append(frappe.opportunitydata_page_template.body);
      this.handleRoute();
    };
    waitForContent();
  }

  handleRoute() {
    this.setActiveSidebar();
    const route = frappe.get_route();
    // opportunity-data
    if (route.length === 1) return this.show_list();
    // opportunity-data/new
    if (route.length === 2 && route[1] === "new") return this.show_new();
    // opportunity-data/<name>
    if (route.length === 2) return this.show_details(route[1]);
  }

  setActiveSidebar() {
    const route = frappe.get_route();
    const baseRoute = route[0];
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

  setTitle(t) { document.title = t; this.page.set_title(t); }

  // -------- VIEWS --------
  show_list() {
    $(".opportunity-data-list").removeClass("d-none");
    $(".opportunity-data-details").addClass("d-none");
    $(".opportunity-data-new").addClass("d-none");

    setTimeout(async () => {
      this.setTitle("Opportunities");
      this.bindPaginationEvents();
      this.bindFilterEvents();
      await this.loadFilters();
      this.applyUrlFilters(); // this triggers first fetch
    }, 150);
  }

  show_details(name) {
    $(".opportunity-data-list").addClass("d-none");
    $(".opportunity-data-details").removeClass("d-none");
    $(".opportunity-data-new").addClass("d-none");
    this.setTitle(`opportunity-data/${name}`);

    
 // Load the document and bind actions
  this.load_doc_details(name);
  this.bind_doc_actions(name);
  this.bind_comment_and_email(name);   // comments + email
  this.init_attachment_section(name);  // attachments
  this.load_activity(name);            // activity timeline


    // Minimal details stub; fetch doc and surface a few fields
    const $box = $("#opp-detail-box");
    $box.html(`<div class="text-muted">Loading...</div>`);
    frappe.call({
      method: "frappe.client.get",
      args: { doctype: OPP_CFG.DOCTYPE, name, fields: ["*"] },
      callback: (r) => {
        const d = r.message || {};
        const party = d[OPP_CFG.PARTY_NAME_FIELD] || d.customer || d.lead || "";
        const title = d[OPP_CFG.TITLE_FIELD] || d.name;
        const status = d[OPP_CFG.STATUS_FIELD] || "";
        const prob = d[OPP_CFG.PROBABILITY_FIELD] ?? "";
        const amount = d[OPP_CFG.AMOUNT_FIELD] ?? 0;
        const exp = d[OPP_CFG.EXPECTED_CLOSE_FIELD] || "";

        $box.html(`
          <div class="frappe-card p-2">
            <h5 class="mb-1">${frappe.utils.escape_html(title)}</h5>
            <div class="text-muted small mb-1">${frappe.utils.escape_html(d.name)}</div>
            <div class="row">
              <div class="col-md-4"><b>Party:</b> ${frappe.utils.escape_html(party)}</div>
              <div class="col-md-4"><b>Stage:</b> ${frappe.utils.escape_html(status)}</div>
              <div class="col-md-4"><b>Prob.:</b> ${prob || ""}%</div>
            </div>
            <div class="row mt-1">
              <div class="col-md-4"><b>Amount:</b> ${fmtCurrency(amount)}</div>
              <div class="col-md-4"><b>Expected Close:</b> ${exp?frappe.datetime.str_to_user(exp):""}</div>
              <div class="col-md-4"><b>Owner:</b> ${frappe.utils.escape_html(d[OPP_CFG.WORK_OWNER_FIELD] || d.owner || "")}</div>
            </div>
          </div>
        `);
      }
    });
  }

  show_new() {
    $(".opportunity-data-list").addClass("d-none");
    $(".opportunity-data-details").addClass("d-none");
    $(".opportunity-data-new").removeClass("d-none");
    this.setTitle("New Opportunity");
    // Add your form binding here if you want to create Opportunities from this page
  }

  // -------- DATA --------
  async loadFilters() {
    try {
      const res = await frappe.call({ method: OPP_CFG.API.get_filters });
      const filters = res && res.message ? res.message : {};
      // owners list for custom multi-select
      this.allOwners = filters.owners || [];
      this.selectedOwners = [];
      this.initializeOwnerDropdown();
    } catch (e) {
      console.error("loadFilters err:", e);
      this.allOwners = [];
    }
  }

  // fetch_list_data({ reset = false, saved_filters = [], override_filters = {} } = {}) {
  //   console.log("fetch_list_data called with:", { reset, saved_filters, override_filters });
  //   if (this._fetching) return Promise.resolve();
  //   this._fetching = true;

  //   if (reset) {
  //     this.all_rows = [];
  //     this.visible_count = 0;
  //   }

  //   const statusVal = this.active_status || "";
  //   const probBucket = this.active_probability || "";
  //   const owners = this.selectedOwners || [];

  //   // normalize advanced filters → pass through as-is (like tickets page)
  //   const filtersPayload = JSON.stringify(saved_filters || []);

  //   return new Promise((resolve, reject) => {
  //     frappe.call({
  //       method: OPP_CFG.API.get_list_data,
  //       args: {
  //         start: reset ? 0 : (this.all_rows.length || 0),
  //         page_length: this.page_length,
  //         status: statusVal,
  //         probability: probBucket,     // e.g., "50-75" handled server-side
  //         owners,
  //         filters: filtersPayload
  //       },
  //       callback: (r) => {
  //         try {
  //           const { data = [], total = 0 } = (r && r.message) || {};
  //           this.total_records = Number.isFinite(total) ? parseInt(total, 10) : (data.length || 0);
  //           if (reset) this.all_rows = Array.isArray(data) ? data.slice() : [];
  //           else if (Array.isArray(data) && data.length) this.all_rows = [...this.all_rows, ...data];

  //           this.visible_count = Math.min(this.all_rows.length, this.total_records);
  //           if (this.total_records === 0) {
  //             this.all_rows = [];
  //             this.visible_count = 0;
  //           }
  //           this.filtered_rows = this.all_rows.slice();
  //           this.render_rows(true);
  //           resolve();
  //         } catch (err) {
  //           reject(err);
  //         } finally {
  //           this._fetching = false;
  //         }
  //       },
  //       error: (err) => {
  //         console.error("get_list_data error:", err);
  //         this._fetching = false;
  //         reject(err);
  //       }
  //     });
  //   });
  // }



  /**
 * Fetch paged Opportunity rows with basic filters (status, probability bucket, owners)
 * and advanced filters (saved_filters → JSON).
 *
 * - Prevents overlapping requests with `_fetch_in_progress` (and keeps `_fetching` in sync).
 * - Resets paging state on `reset: true`.
 * - Normalizes `saved_filters` into `[field, operator, value]` triplets.
 * - Accepts `override_filters` to force values (e.g., during URL restore).
 * - Updates counts and renders rows.
 *
 * Expected backend signature (kept as-is from your Opportunity call):
 *   method: OPP_CFG.API.get_list_data
 *   args: { start, page_length, status, probability, owners, filters }
 */
fetch_list_data({ reset = false, saved_filters = [], override_filters = {} } = {}) {
  const me = this;
  console.log("%c[Opportunity] fetch_list_data called", "color:#2e86de;", {
    reset, saved_filters, override_filters
  });

  // sensible default
  if (!me.page_length) me.page_length = 20;

  // prevent overlapping requests (use the same guard as tickets)
  if (me._fetch_in_progress || me._fetching) {
    console.warn("[fetch_list_data] fetch already in progress — skipping");
    return Promise.resolve();
  }
  me._fetch_in_progress = true;
  me._fetching = true;

  if (reset) {
    me.all_rows = [];
    me.visible_count = 0;
  }

  // ---- resolve current filter state (allow overrides) ----
  const normalizeCSVorArray = (val) => {
    if (val == null) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    return String(val)
      .split(",")
      .map(v => v.trim())
      .filter(Boolean);
  };

  // Take from override_filters if present, else from component state
  me.active_status = Object.prototype.hasOwnProperty.call(override_filters, "status")
    ? (override_filters.status || "")
    : (me.active_status || "");

  me.active_probability = Object.prototype.hasOwnProperty.call(override_filters, "probability")
    ? (override_filters.probability || "")
    : (me.active_probability || "");

  // owners (array)
  me.selectedOwners = Object.prototype.hasOwnProperty.call(override_filters, "owners")
    ? normalizeCSVorArray(override_filters.owners)
    : (me.selectedOwners || []);

  const statusVal  = me.active_status || "";
  const probBucket = me.active_probability || "";  // e.g., "50-75"
  const owners     = normalizeCSVorArray(me.selectedOwners);

  // ---- normalize advanced filters (saved_filters) to [field, operator, value] ----
  const normalizedFilters = (saved_filters || []).map(f => {
    // Frappe filter array forms: [Doctype, field, operator, value, ...] OR [field, operator, value]
    if (Array.isArray(f)) {
      // If 5+ assume shape like [DT, field, operator, value, condition]; take middle triple
      const arr = f.length >= 5 ? f.slice(1, 4) : f.slice(0, 3);
      const [field, operatorRaw, valueRaw] = arr;
      const operator = (operatorRaw || "=").toLowerCase();
      let value = valueRaw;
      if (operator === "between" && typeof value === "string" && value.includes(",")) {
        value = value.split(",").map(v => v.trim());
      }
      return { field, operator, value };
    }
    // Object form: { field/fieldname, operator, value }
    if (typeof f === "object" && f !== null) {
      const field = f.fieldname || f.field || "";
      const operator = (f.operator || "=").toLowerCase();
      let value = f.value;
      if (operator === "between" && typeof value === "string" && value.includes(",")) {
        value = value.split(",").map(v => v.trim());
      }
      return { field, operator, value };
    }
    return {};
  });

  const filtersPayload = normalizedFilters.map(f => {
    if (f.field && f.operator) {
      let val = f.value;
      if (f.operator === "between") {
        if (typeof val === "string" && val.includes(",")) {
          val = val.split(",").map(v => v.trim());
        } else if (!Array.isArray(val)) {
          val = [val, val];
        }
      }
      return [f.field, f.operator, val];
    }
    return f;
  });

  console.log("%c[Opportunity][DEBUG] → filtersPayload:", "color:#27ae60;", filtersPayload);

  // ---- backend call ----
  return new Promise((resolve, reject) => {
    frappe.call({
      method: OPP_CFG.API.get_list_data,
      args: {
        start: reset ? 0 : (me.all_rows ? me.all_rows.length : 0),
        page_length: me.page_length,
        status: statusVal,
        probability: probBucket,   // handled server-side as buckets
        owners,
        filters: JSON.stringify(filtersPayload)
      },
      callback: (r) => {
        try {
          const { data = [], total = 0 } = (r && r.message) || {};
          // Always trust server-provided total
          me.total_records = Number.isFinite(total) ? parseInt(total, 10) : (Array.isArray(data) ? data.length : 0);

          if (reset) {
            me.all_rows = Array.isArray(data) ? data.slice() : [];
          } else if (Array.isArray(data) && data.length > 0) {
            me.all_rows = [...(me.all_rows || []), ...data];
          }

          // visible count is bounded by total
          me.visible_count = Math.min((me.all_rows || []).length, me.total_records);

          // If server says total is zero, clear arrays
          if (me.total_records === 0) {
            me.all_rows = [];
            me.visible_count = 0;
          }

          // mirror for any client-side post-filtering (kept aligned with tickets page)
          me.filtered_rows = (me.all_rows || []).slice();

          // Optional: update counters if present
          const visEl = document.getElementById("visible-count");
          const totEl = document.getElementById("total-count");
          if (visEl) visEl.innerHTML = me.visible_count.toLocaleString();
          if (totEl) totEl.innerHTML = me.total_records.toLocaleString();
          const countHeader = document.getElementById("count-header");
          if (countHeader) {
            countHeader.setAttribute(
              "title",
              `${me.visible_count.toLocaleString()} of ${me.total_records.toLocaleString()}`
            );
          }

          // render rows
          me.render_rows?.(true);
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          me._fetch_in_progress = false;
          me._fetching = false;
        }
      },
      error: (err) => {
        console.error("%c[Opportunity][DEBUG] → frappe.call error:", "color:red;", err);
        me._fetch_in_progress = false;
        me._fetching = false;
        reject(err);
      }
    });
  });
}

  // -------- TABLE RENDER --------
  render_rows(useFiltered = false) {
    const wrapper = this.page.wrapper[0] || this.page.wrapper;
    const tbody = wrapper.querySelector(".opportunities-table tbody");
    const loadMoreBtn = wrapper.querySelector(".btn-more");
    const visEl = document.getElementById("visible-count");
    const totEl = document.getElementById("total-count");

    if (!tbody) return;
    tbody.innerHTML = "";

    const data = useFiltered ? (this.filtered_rows || []) : (this.all_rows || []);
    if (!data.length) {
      tbody.insertAdjacentHTML("beforeend", `
        <tr><td colspan="11" class="text-center text-muted py-4">No opportunities found.</td></tr>
      `);
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
      if (visEl) visEl.textContent = 0;
      if (totEl) totEl.textContent = this.total_records || 0;
      return;
    }

    this.visible_count = Math.min(this.visible_count || 0, this.total_records || data.length);
    const visible = data.slice(0, this.visible_count);

    visible.forEach(doc => {
      const name = doc.name;
      const title = doc[OPP_CFG.TITLE_FIELD] || name;
      const party = doc[OPP_CFG.PARTY_NAME_FIELD] || doc.customer || doc.lead || "";
      const stage = doc[OPP_CFG.STATUS_FIELD] || "";
      const prob = (doc[OPP_CFG.PROBABILITY_FIELD] ?? "");
      const amount = (doc[OPP_CFG.AMOUNT_FIELD] ?? 0);
      const exp = doc[OPP_CFG.EXPECTED_CLOSE_FIELD] || "";
      const owner = doc[OPP_CFG.WORK_OWNER_FIELD] || doc.owner || "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="checkbox-cell"><input type="checkbox" class="form-check-input form-check-input-light"></td>
        <td><a class="doc-link ids link-reset" data-doc-name="${frappe.utils.escape_html(name)}" href="/app/${OPP_CFG.ROUTE}/${encodeURIComponent(name)}">${frappe.utils.escape_html(name)}</a></td>
        <td class="ellipsis" title="${frappe.utils.escape_html(title)}">${frappe.utils.escape_html(title)}</td>
        <td class="ellipsis" title="${frappe.utils.escape_html(party)}">${frappe.utils.escape_html(party)}</td>
        <td><span class="pill ${this.getStageClass(stage)}" title="${frappe.utils.escape_html(stage)}">${frappe.utils.escape_html(stage)}</span></td>
        <td class="ellipsis" title="${prob}">${prob || ""}</td>
        <td class="ellipsis" title="${amount}">${fmtCurrency(amount)}</td>
        <td class="ellipsis" title="${exp}">${this.formatDate(exp)}</td>
        <td class="ellipsis" title="${frappe.utils.escape_html(owner)}">${frappe.utils.escape_html(owner)}</td>
        <td><div class="d-flex align-items-center" id="assigned_to_container_${name.replace(/[^a-zA-Z0-9]/g, "_")}"></div></td>
        <td>
          <div class="d-flex align-items-center justify-content-center gap-1 doc-link" data-doc-name="${frappe.utils.escape_html(name)}" style="cursor:pointer;">
            <span title="${frappe.utils.escape_html(doc.modified || "")}">${this.formatModified(doc.modified)}</span>
            <span class="d-flex align-items-center gap-1 ml-1" title="${doc.comment_count || 0}">
              <i class="fa fa-comment fs-lg"></i>${doc.comment_count || 0}
            </span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);

      // preserve checkbox state
      const cb = tr.querySelector('input[type="checkbox"]');
      if (this.selected.has(name)) cb.checked = true;

      // assigned avatars
      if (doc._assign) {
        const containerId = `assigned_to_container_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
        this.renderAssignedAvatars(containerId, doc._assign);
      }
    });

    // counts & load more
    if (visEl) visEl.textContent = Math.min(this.visible_count || 0, this.total_records || 0);
    if (totEl) totEl.textContent = this.total_records || 0;
    if (loadMoreBtn) loadMoreBtn.style.display = (this.visible_count >= (this.total_records || 0)) ? "none" : "inline-block";

    // Row link navigation + persist filters
    $(wrapper).off("click", ".doc-link").on("click", ".doc-link", (e) => {
      e.preventDefault();
      const name = $(e.currentTarget).data("doc-name");
      if (!name) return;
      try {
        localStorage.setItem(OPP_CFG.LS.last_filters, window.location.search || "");
        localStorage.setItem(OPP_CFG.LS.page_len, String(this.page_length));
      } catch {}
      frappe.set_route(OPP_CFG.ROUTE, name);
    });

    // selection bar (optional: show actions when selected)
    const table = wrapper.querySelector(".opportunities-table");
    if (table) {
      const selectAll = table.querySelector("#selectAllOpps");
      if (selectAll) {
        const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
        const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
        selectAll.checked = (all > 0 && all === checked);
      }

      table.addEventListener("change", (e) => {
        if (e.target.matches('tbody input[type="checkbox"]')) {
          const row = e.target.closest("tr");
          const name = row.querySelector(".ids")?.textContent?.trim();
          if (name) {
            if (e.target.checked) this.selected.add(name);
            else this.selected.delete(name);
          }
        }
      });
      if (selectAll) {
        selectAll.addEventListener("change", (e) => {
          const allRowCBs = table.querySelectorAll('tbody input[type="checkbox"]');
          allRowCBs.forEach(cb => {
            cb.checked = e.target.checked;
            const row = cb.closest("tr");
            const name = row.querySelector(".ids")?.textContent?.trim();
            if (name) {
              if (e.target.checked) this.selected.add(name);
              else this.selected.delete(name);
            }
          });
        });
      }
    }
  }

  async renderAssignedAvatars(containerId, assignJson) {
    const container = document.getElementById(containerId);
    if (!container || !assignJson) return;
    let users = [];
    try { users = JSON.parse(assignJson); } catch { return; }
    if (!users.length) return;

    const res = await frappe.call({ method: OPP_CFG.API.get_users_basic_info, args: { users } });
    const docs = res.message || [];
    const visible = docs.slice(0, 3);
    const extra = docs.length - visible.length;

    container.innerHTML = `
      ${visible.map((u,i)=>`
        <div class="assign-avatar" title="${frappe.utils.escape_html(u.full_name || u.name)}" style="margin-left:${i===0?0:"-8px"}">
          ${u.user_image ? `<img src="${frappe.utils.get_file_link(u.user_image)}">`
                         : `<div class="assign-avatar assign-initials">${this.initials(u.full_name || u.name)}</div>`}
        </div>`).join("")}
      ${extra>0?`
        <div class="assign-avatar" style="margin-left:-8px;background:#6c757d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;"
          title="${docs.slice(3).map(u=>u.full_name).join(", ")}">+${extra}</div>`:""}
    `;
  }


async load_doc_details(name) {
  const d = await frappe.call({
    method: "frappe.client.get",
    args: { doctype: OPP_CFG.DOCTYPE, name, fields: ["*"] }
  }).then(r => r.message || {});

  // Header
  $("#opp-name").text(d.name || "");
  const titleVal = d[OPP_CFG.TITLE_FIELD] || d.name || "";
  $("#opp-title").text(titleVal).attr("title", titleVal);
  $("#opp-title-2").text(titleVal).attr("title", titleVal);

  // Stage badge
  const stage = d[OPP_CFG.STATUS_FIELD] || "";
  $("#doc-status").text(stage).attr("title", stage);

  // Probability badge
  (function setProbabilityBadge(prob) {
    const $badge = $("#probability_badge");
    const p = Number(prob || 0);
    $badge.text(p ? `${p}%` : "");
    $badge.css("background-color",
      p >= 75 ? "#16A34A" : p >= 50 ? "#f7b848" : "#6c757d");
  })(d[OPP_CFG.PROBABILITY_FIELD]);

  // Description
  $("#description").html(d[OPP_CFG.DESCRIPTION_FIELD] || "");

  // Summary fields (party, amount, expected close, owner)
  const party = d[OPP_CFG.PARTY_NAME_FIELD] || d.customer || d.lead || "";
  const amount = d[OPP_CFG.AMOUNT_FIELD] ?? 0;
  const exp = d[OPP_CFG.EXPECTED_CLOSE_FIELD] || "";
  const owner = d[OPP_CFG.WORK_OWNER_FIELD] || d.owner || "";

  const summaryHtml = `
    <div class="row">
      ${party ? `
      <div class="col-md-4 mb-2">
        <h6 class="text-uppercase text-muted1">Party</h6>
        <div class="d-flex align-items-center gap-2">
          <span class="ellipsis" title="${frappe.utils.escape_html(party)}">${frappe.utils.escape_html(party)}</span>
        </div>
      </div>` : ""}

      <div class="col-md-4 mb-2">
        <h6 class="text-uppercase text-muted1">Amount</h6>
        <div class="d-flex align-items-center gap-2">
          <span class="ellipsis" title="${amount}">${fmtCurrency(amount)}</span>
        </div>
      </div>

      ${exp ? `
      <div class="col-md-4 mb-2">
        <h6 class="text-uppercase text-muted1">Expected Closing</h6>
        <div class="d-flex align-items-center gap-2">
          <span class="ellipsis" title="${frappe.datetime.str_to_user(exp)}">${frappe.datetime.str_to_user(exp)}</span>
        </div>
      </div>` : ""}

      ${owner ? `
      <div class="col-md-4 mb-2">
        <h6 class="text-uppercase text-muted1">Owner</h6>
        <div class="d-flex align-items-center gap-1">
          <div id="owner_avatar" class="rounded-circle1 avatar1-sm d-flex align-items-center justify-content-center bg-secondary text-white"></div>
          <span class="ellipsis" title="${frappe.utils.escape_html(owner)}">${frappe.utils.escape_html(owner)}</span>
        </div>
      </div>` : ""}
    </div>
  `;
  $("#docdatadisplay").html(summaryHtml);

  // Owner avatar (image or initials)
  if (owner) {
    const res = await frappe.db.get_value("User", owner, ["user_image", "full_name"]);
    const avatarDiv = $("#owner_avatar");
    const fullName = res?.message?.full_name || owner;
    const img = res?.message?.user_image ? encodeURI(res.message.user_image) : "";
    if (img) {
      avatarDiv.css({
        "background-image": `url(${img})`,
        "background-size": "cover",
        "background-position": "center",
        "color": "transparent", "font-size": "0"
      }).text("");
    } else {
      avatarDiv
        .css({ "background-image":"none", "background-color":"#6c757d", "color":"#fff", "font-size":"12.25px" })
        .text(getInitials(fullName));
    }
  }

  // Assigned avatars (from _assign)
  if (d._assign) {
    const users = JSON.parse(d._assign || "[]");
    const map = await this.fetchUsersBasic(users);
    $("#doc-details-assign-users").html(buildAvatarGroup(map));
  }

  function getInitials(name) {
    const p = (name || "User").trim().split(/\s+/);
    return ((p[0]?.[0] || "U") + (p[p.length-1]?.[0] || "")).toUpperCase();
  }
  function buildAvatarGroup(users) {
    if (!users?.length) return "";
    const visible = users.slice(0,3);
    const extra = users.length - visible.length;
    return `
      <div style="display:flex;align-items:center;">
        ${visible.map((u,i)=>`
          <div class="avatar-item" title="${frappe.utils.escape_html(u.full_name)}" style="margin-left:${i===0?0:"0px"}">
            ${u.image ? `<img src="${u.image}">`
                      : `<span class="avatar-initials">${getInitials(u.full_name)}</span>`}
          </div>`).join("")}
        ${extra>0 ? `<div class="extra-avatar" title="${users.slice(3).map(u=>u.full_name).join(", ")}">+${extra}</div>` : ""}
      </div>
    `;
  }
}

async fetchUsersBasic(users) {
  if (!users?.length) return [];
  const r = await frappe.call({
    method: OPP_CFG.API.get_users_basic_info,
    args: { users }
  });
  const out = (r.message || []).map(u => ({
    name: u.name,
    full_name: u.full_name || u.name,
    image: u.user_image ? frappe.utils.get_file_link(u.user_image) : ""
  }));
  return out;
}

bind_doc_actions(name) {
  const me = this;

  // Stage changes
  $("#doc-status-actions-dropdown")
    .off("click", "a[data-action]")
    .on("click", "a[data-action]", function (e) {
      e.preventDefault();
      const action = $(this).data("action");
      const stageMap = {
        set_open: "Open",
        set_quotation: "Quotation",
        set_converted: "Converted",
        set_lost: "Lost",
        set_on_hold: "On Hold",
      };
      const new_status = stageMap[action];
      if (!new_status) return;

      frappe.call({
        method: "frappe.client.set_value",
        args: {
          doctype: OPP_CFG.DOCTYPE,
          name,
          fieldname: OPP_CFG.STATUS_FIELD,
          value: new_status
        },
        freeze: true,
        freeze_message: "Updating stage...",
        callback: () => {
          frappe.show_alert({ message: __("Stage updated to {0}", [new_status]), indicator: "green" });
          me.load_doc_details(name);
        }
      });
    });

  // Actions dropdown (Assign, Email)
  $("#doc-actions-dropdown")
    .off("click", "a[data-action]")
    .on("click", "a[data-action]", (e) => {
      e.preventDefault();
      const action = $(e.currentTarget).data("action");
      if (action === "assign") return me.openAssignDialog(name);
      if (action === "email") return $("#email-send").trigger("click");
    });
}

openAssignDialog(name) {
  const d = new frappe.ui.form.AssignToDialog({
    doctype: OPP_CFG.DOCTYPE,
    docname: name
  });
  d.dialog.set_primary_action(__("Assign"), () => {
    const values = d.dialog.get_values();
    if (!values) return;
    d.dialog.hide();
    frappe.call({
      method: "frappe.desk.form.assign_to.add",
      args: {
        doctype: OPP_CFG.DOCTYPE,
        name,
        assign_to: values.assign_to,
        assign_to_me: values.assign_to_me,
        assign_to_user_group: values.assign_to_user_group,
        description: values.description,
        due_date: values.due_date,
        priority: values.priority,
        notify: values.notify || 0
      },
      callback: () => {
        frappe.show_alert({ message: __("Assigned successfully"), indicator: "green" });
        this.load_doc_details(name);
      }
    });
  });
  d.dialog.show();
}


init_attachment_section(name) {
  const me = this;
  const $btn = $("#add-attachment-btn");
  if (!$btn.length || !name) return;

  $btn.off("click.addAttachment").on("click.addAttachment", () => {
    new frappe.ui.FileUploader({
      doctype: OPP_CFG.DOCTYPE,
      docname: name,
      allow_multiple: true,
      make_attachments_public: true,
      on_success(file) {
        frappe.show_alert({ message: __("Attachment added"), indicator: "green" });
        me.render_doc_attachments(name);
      }
    });
  });

  this.render_doc_attachments(name);
}

render_doc_attachments(name) {
  const $list = $("#doc-attachments-list");
  if (!$list.length) return;
  if (!name) { $list.html(`<span class="text-muted">No attachments to show</span>`); return; }

  $list.html(`<span class="text-muted">Loading attachments...</span>`);

  frappe.db.get_list("File", {
    fields: ["name", "file_name", "file_url", "creation", "owner"],
    filters: { attached_to_doctype: OPP_CFG.DOCTYPE, attached_to_name: name, is_folder: 0 },
    order_by: "creation desc",
    limit: 50
  }).then(files => {
    if (!files?.length) {
      $list.html(`<span class="text-muted">No attachments yet</span>`);
      return;
    }
    const html = files.map(file => {
      const label = frappe.utils.escape_html(file.file_name || file.file_url || file.name);
      const url = file.file_url ? encodeURI(file.file_url) : "";
      return `
        <div class="d-flex align-items-center gap-1 px-2 py-1 border rounded bg-light attachment-chip" title="${label}">
          <i class="fa fa-paperclip text-muted"></i>
          ${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-decoration-none text-truncate">${label}</a>`
               : `<span class="text-muted text-truncate">${label}</span>`}
        </div>
      `;
    }).join("");
    $list.html(html);
  }).catch(() => {
    $list.html(`<span class="text-danger">Unable to load attachments</span>`);
  });
}



load_activity(name) {
  // Replace with your own server method when ready
  frappe.call({
    method: "frappe.desk.form.load.get_communications",
    args: { doctype: OPP_CFG.DOCTYPE, name, start: 0, limit: 20 },
    callback: (r) => {
      const comms = (r.message && r.message.communication || []);
      const container = $("#activity-timeline");
      if (!comms.length) return container.html(`<p class="text-muted">No activity yet.</p>`);

      const html = comms.map(c => `
        <div class="timeline-item d-block d-md-flex align-items-stretch w-100">
          <div class="timeline-time pe-3 text-muted mb-1 mb-md-0">${frappe.datetime.str_to_user(c.communication_date) || ""}</div>
          <div class="timeline-dot bg-secondary mx-md-2 my-1 my-md-0 d-none d-md-flex align-items-center justify-content-center">
            <i class="fa fa-envelope-open-text text-white"></i>
          </div>
          <div class="timeline-content frappe-card ps-md-3 pb-4 mb-1 ml-1">
            <span class="mb-1 fs-sm text-muted">${frappe.utils.escape_html(c.subject || "")}</span>
            <div class="text-muted">${c.content || ""}</div>
            <span class="text-primary fs-sm d-block mt-2">By ${frappe.utils.escape_html(c.sender || "")}</span>
          </div>
        </div>
      `).join("");
      container.html(html);
    }
  });
}

bind_comment_and_email(name) {
  // Add comment
  $("#add-comment-btn").off("click").on("click", () => {
    const html = ($("#new-comment-input").html() || "").trim();
    const plain = $("<div>").html(html).text().trim();
    if (!plain) return frappe.msgprint("Please enter a comment.");

    frappe.call({
      method: "frappe.desk.form.utils.add_comment",
      args: {
        reference_doctype: OPP_CFG.DOCTYPE,
        reference_name: name,
        content: html,
        comment_email: frappe.session.user,
        comment_by: frappe.session.user_fullname
      },
      callback: () => {
        frappe.show_alert({ message: "Comment added", indicator: "green" });
        $("#new-comment-input").html("<p><br></p>");
        this.load_activity(name);
      }
    });
  });

  // Email dialog (simple)
  $("#email-send").off("click").on("click", async (e) => {
    e.preventDefault();

    const doc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, name);
    const default_email = doc.contact_email || "";

    const d = new frappe.ui.Dialog({
      title: __("Send Email"),
      fields: [
        { label: __("To"), fieldname: "recipients", fieldtype: "Data", reqd: 1, default: default_email },
        { label: __("Subject"), fieldname: "subject", fieldtype: "Data", reqd: 1, default: doc[OPP_CFG.TITLE_FIELD] || doc.name },
        { label: __("Message"), fieldname: "content", fieldtype: "Text Editor", reqd: 1 },
      ],
      primary_action_label: __("Send"),
      primary_action: (v) => {
        if (!v.recipients || !v.subject || !v.content) return;
        d.hide();
        frappe.call({
          method: "frappe.core.doctype.communication.email.make",
          args: {
            doctype: OPP_CFG.DOCTYPE,
            name,
            recipients: v.recipients,
            subject: v.subject,
            content: v.content,
            send_email: 1
          },
          freeze: true,
          freeze_message: "Sending email...",
          callback: () => frappe.show_alert({ message: "Email sent", indicator: "green" }),
          error: () => frappe.msgprint("Failed to send email.")
        });
      }
    });
    d.show();
  });
}







  // -------- FILTERS / PAGING --------
  bindPaginationEvents() {
    const wrapper = this.page.wrapper[0] || this.page.wrapper;
    let btns = wrapper.querySelectorAll(".btn-paging");

    // reset listeners
    btns.forEach(b => b.replaceWith(b.cloneNode(true)));
    btns = wrapper.querySelectorAll(".btn-paging");

    btns.forEach(btn => {
      btn.addEventListener("click", async () => {
        btns.forEach(b => { b.classList.remove("btn-info", "active-pagination"); b.style.backgroundColor=""; b.style.color=""; });
        btn.classList.add("btn-info","active-pagination");
        btn.style.backgroundColor = "#6C5CE7";
        btn.style.color = "white";
        this.page_length = parseInt(btn.dataset.value, 10);
        await this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
      });
    });

    // restore from localStorage
    const saved = localStorage.getItem(OPP_CFG.LS.page_len);
    this.page_length = saved ? parseInt(saved, 10) : 20;
    const activeBtn = wrapper.querySelector(`.btn-paging[data-value="${this.page_length}"]`);
    if (activeBtn) {
      activeBtn.classList.add("btn-info","active-pagination");
      activeBtn.style.backgroundColor = "#6C5CE7";
      activeBtn.style.color = "white";
    }

    const loadMoreBtn = wrapper.querySelector(".btn-more");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", async () => {
        loadMoreBtn.classList.add("active-pagination");
        loadMoreBtn.style.backgroundColor = "#E7E5F9";
        loadMoreBtn.style.color = "black";
        await this.fetch_list_data({ reset: false, saved_filters: this.saved_filters });
        setTimeout(() => {
          loadMoreBtn.classList.remove("active-pagination");
          loadMoreBtn.style.backgroundColor = "";
          loadMoreBtn.style.color = "";
        }, 400);
      });
    }
  }

  // bindFilterEvents() {
  //   const wrapper = this.page.wrapper[0] || this.page.wrapper;
  //   const statusSel = wrapper.querySelector('#filterStatus');
  //   const probSel = wrapper.querySelector('#filterProbability');

  //   const filterButton = wrapper.querySelector('.filter-button');
	// 	const clearFilterButton = wrapper.querySelector('.filter-x-button');

  //   // color/placeholder sync
  //   const syncPlaceholder = (sel) => {
  //     if (!sel) return;
  //     if (!sel.value) sel.classList.add("placeholder");
  //     else sel.classList.remove("placeholder");
  //   };

  //   if (statusSel) {
  //     syncPlaceholder(statusSel);
  //     statusSel.addEventListener("change", () => {
  //       this.active_status = statusSel.value || "";
  //       syncPlaceholder(statusSel);
  //       this.updateUrl();
  //       this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
  //     });
  //   }
  //   if (probSel) {
  //     syncPlaceholder(probSel);
  //     probSel.addEventListener("change", () => {
  //       this.active_probability = probSel.value || "";
  //       syncPlaceholder(probSel);
  //       this.updateUrl();
  //       this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
  //     });
  //   }

  //   // owner dropdown (custom multi-select)
  //   // open/close
  //   const ownerChip = document.getElementById("filterowner");
  //   const dropdown = document.getElementById("owner-dropdown");
  //   const search = document.getElementById("owner-search-dropdown");
  //   ownerChip?.addEventListener("click", (e) => {
  //     e.stopPropagation();
  //     const open = dropdown.style.display === "block";
  //     dropdown.style.display = open ? "none" : "block";
  //     if (!open) {
  //       if (search) { search.value = ""; setTimeout(()=>search.focus(),30); }
  //       this.renderOwners("");
  //     }
  //   });
  //   document.addEventListener("click", (e) => {
  //     if (!dropdown?.contains(e.target) && e.target !== ownerChip && !ownerChip?.contains(e.target)) {
  //       if (dropdown) dropdown.style.display = "none";
  //     }
  //   });
  //   search?.addEventListener("input", (e) => {
  //     e.stopPropagation(); this.renderOwners(e.target.value || "");
  //   });
  // }



//   bindFilterEvents() {
//   const me = this;
//   const wrapper = this.page.wrapper[0] || this.page.wrapper;

//   // ===== Config =====
//   const DOCTYPE = me.filter_doctype || "Opportunity";
//   const LS_KEY = `${DOCTYPE.toLowerCase()}_theme_last_filters`;

//   // ===== Basic Filters (existing) =====
//   const statusFilter        = wrapper.querySelector('[data-table-filter="status"]');
//   const priorityFilter      = wrapper.querySelector('[data-table-range-filter="priority"]');
//   const workingAgentFilter  = wrapper.querySelector('[data-table-range-filter="working_agents"]');

//   const filterButton       = wrapper.querySelector('.filter-button');
//   const clearFilterButton  = wrapper.querySelector('.filter-x-button');



//    // owner dropdown (custom multi-select)
//     // open/close
//     const ownerChip = document.getElementById("filterowner");
//     const dropdown = document.getElementById("owner-dropdown");
//     const search = document.getElementById("owner-search-dropdown");
//     ownerChip?.addEventListener("click", (e) => {
//       e.stopPropagation();
//       const open = dropdown.style.display === "block";
//       dropdown.style.display = open ? "none" : "block";
//       if (!open) {
//         if (search) { search.value = ""; setTimeout(()=>search.focus(),30); }
//         this.renderOwners("");
//       }
//     });
//     document.addEventListener("click", (e) => {
//       if (!dropdown?.contains(e.target) && e.target !== ownerChip && !ownerChip?.contains(e.target)) {
//         if (dropdown) dropdown.style.display = "none";
//       }
//     });
//     search?.addEventListener("input", (e) => {
//       e.stopPropagation(); this.renderOwners(e.target.value || "");
//     });

//   // ===== New Basic Filters (simple inputs/selects) =====
//   // Dates (yyyy-mm-dd)
//   const createdFrom  = wrapper.querySelector('[data-table-filter="created_from"]');
//   const createdTo    = wrapper.querySelector('[data-table-filter="created_to"]');
//   const modifiedFrom = wrapper.querySelector('[data-table-filter="modified_from"]');
//   const modifiedTo   = wrapper.querySelector('[data-table-filter="modified_to"]');
//   const closeFrom    = wrapper.querySelector('[data-table-filter="close_from"]');      // expected close from
//   const closeTo      = wrapper.querySelector('[data-table-filter="close_to"]');        // expected close to

//   // Deal size range
//   const dealMin = wrapper.querySelector('[data-table-filter="deal_min"]');
//   const dealMax = wrapper.querySelector('[data-table-filter="deal_max"]');

//   // Entity fields
//   const accountInput = wrapper.querySelector('[data-table-filter="account"]');   // input or select
//   const contactInput = wrapper.querySelector('[data-table-filter="contact"]');   // input or select
//   const industrySel  = wrapper.querySelector('[data-table-filter="industry"]');  // select
//   const regionSel    = wrapper.querySelector('[data-table-filter="region"]');    // select
//   const productSel   = wrapper.querySelector('[data-table-filter="product"]');   // select
//   const tagsInput    = wrapper.querySelector('[data-table-filter="tags"]');      // input or token field

//   // ===== Helpers =====
//   const debounce = (fn, wait = 300) => {
//     let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
//   };

//   const parseNumber = (el) => {
//     if (!el || el.value === '') return null;
//     const n = Number(String(el.value).replace(/,/g, ''));
//     return Number.isFinite(n) ? n : null;
//   };

//   const asDate = (el) => (el && el.value) ? el.value : "";

//   function validateRanges() {
//     // Deal range
//     const min = parseNumber(dealMin);
//     const max = parseNumber(dealMax);
//     if (min != null && max != null && min > max) {
//       me.showToast?.("Deal size: Min cannot exceed Max", "warning");
//       return false;
//     }
//     // Date ranges (string compare OK for yyyy-mm-dd)
//     const ranges = [
//       { from: asDate(createdFrom),  to: asDate(createdTo),  name: "Created Date" },
//       { from: asDate(modifiedFrom), to: asDate(modifiedTo), name: "Modified Date" },
//       { from: asDate(closeFrom),    to: asDate(closeTo),    name: "Expected Close Date" },
//     ];
//     for (const r of ranges) {
//       if (r.from && r.to && r.from > r.to) {
//         me.showToast?.(`${r.name}: From cannot be after To`, "warning");
//         return false;
//       }
//     }
//     return true;
//   }

//   // Single place to push a fetch (keeps shape consistent)
//   function fetchWithCurrentFilters() {
//     me.fetch_list_data({ reset: true, saved_filters: me.saved_filters || [] });
//   }

//   // Update basic filters' placeholder styling using your helper
//   function wirePlaceholder(el) {
//     if (!el) return;
//     me.syncPlaceholder?.(el);
//     el.addEventListener("change", () => me.syncPlaceholder?.(el));
//   }

//   // ===== Initialize saved_filters & button counter =====
//   let filter_group = null;
//   me.saved_filters = me.saved_filters || [];

//   setTimeout(() => {
    
//     if (filterButton && me.saved_filters && me.saved_filters.length > 0) {
// 				const $btn = $(filterButton);
// 				update_filter_button_count($btn, me.saved_filters.length);
// 			} else if (filterButton) {
// 				const $btn = $(filterButton);
// 				update_filter_button_count($btn, 0);
// 			}
//   }, 100);

//   // ===== Clear Basic UI (and state) =====
//   function clearBasicFilterUI() {
//     // Reset element values
//     [
//       statusFilter, priorityFilter, industrySel, regionSel, productSel
//     ].forEach(el => { if (el) el.value = ""; });

//     // Multi-select working agents
//     if (workingAgentFilter) {
//       me.selectedAgents = [];
//       me.updateWorkingAgentDisplay?.();
//     }

//     // Inputs
//     [
//       createdFrom, createdTo, modifiedFrom, modifiedTo, closeFrom, closeTo,
//       dealMin, dealMax, accountInput, contactInput, tagsInput
//     ].forEach(el => { if (el) el.value = ""; });

//     // State
//     Object.assign(me, {
//       active_status: "", active_priority: "",
//       active_working_agent: [],
//       created_from: "", created_to: "",
//       modified_from: "", modified_to: "",
//       close_from: "", close_to: "",
//       active_deal_min: null, active_deal_max: null,
//       active_account: "", active_contact: "",
//       active_industry: "", active_region: "",
//       active_product: "", active_tags: ""
//     });

//     // Placeholders
//     [statusFilter, priorityFilter, workingAgentFilter, industrySel, regionSel, productSel]
//       .forEach(wirePlaceholder);

//     // Remove visual active from any cards (kept from your code)
//     wrapper.querySelectorAll(".ticket-status-card").forEach(card => {
//       card.classList.remove("active-status-card");
//       card.style.boxShadow = "";
//     });

//     // Button label
//     if (filterButton) {
//       const $btn = $(filterButton);
//       const $label = $btn.find(".button-label");
//       if ($label && $label.length) $label.text("Filter");
//     }

//     // Tooltips (keep your hooks)
//     me.updateStatusTooltip?.(statusFilter);
//     me.updatePriorityTooltip?.(priorityFilter);
//     me.updateWorkingAgentTooltip?.();
//   }

//   // ===== Wire placeholders for current elements =====
//   [statusFilter, priorityFilter, workingAgentFilter, industrySel, regionSel, productSel]
//     .forEach(wirePlaceholder);

//   // ===== BASIC FILTER LISTENERS (instant fetch like your pattern) =====
//   if (statusFilter) statusFilter.addEventListener("change", () => {
//     me.active_status = statusFilter.value || "";
//     fetchWithCurrentFilters();
//     updateUrlWithFilters(me.saved_filters);
//   });

//   if (priorityFilter) priorityFilter.addEventListener("change", () => {
//     me.active_priority = priorityFilter.value || "";
//     fetchWithCurrentFilters();
//     updateUrlWithFilters(me.saved_filters);
//   });

//   if (workingAgentFilter) {
//     // If not a custom chip-based multiselect, read values from <select multiple>
//     workingAgentFilter.addEventListener("change", () => {
//       me.active_working_agent = me.getSelectValues?.(workingAgentFilter) || [];
//       fetchWithCurrentFilters();
//       updateUrlWithFilters(me.saved_filters);
//     });
//   }

//   // ===== NEW BASIC FILTER LISTENERS =====
//   // Dates
//   const onDateChange = () => {
//     me.created_from  = asDate(createdFrom);
//     me.created_to    = asDate(createdTo);
//     me.modified_from = asDate(modifiedFrom);
//     me.modified_to   = asDate(modifiedTo);
//     me.close_from    = asDate(closeFrom);
//     me.close_to      = asDate(closeTo);
//     // Keep it instant to match your basic pattern
//     if (validateRanges()) {
//       fetchWithCurrentFilters();
//       updateUrlWithFilters(me.saved_filters);
//     }
//   };
//   [createdFrom, createdTo, modifiedFrom, modifiedTo, closeFrom, closeTo]
//     .forEach(el => el && el.addEventListener("change", onDateChange));

//   // Deal size
//   const onDealRangeChange = () => {
//     me.active_deal_min = parseNumber(dealMin);
//     me.active_deal_max = parseNumber(dealMax);
//     if (validateRanges()) {
//       fetchWithCurrentFilters();
//       updateUrlWithFilters(me.saved_filters);
//     }
//   };
//   dealMin?.addEventListener("input", onDealRangeChange);
//   dealMax?.addEventListener("input", onDealRangeChange);

//   // Account / Contact / Tags (debounced text-ish)
//   const syncText = (key, el) => {
//     me[key] = (el?.value || "").trim();
//     fetchWithCurrentFilters();
//     updateUrlWithFilters(me.saved_filters);
//   };
//   if (accountInput) accountInput.addEventListener("input", debounce(() => syncText("active_account", accountInput), 300));
//   if (contactInput) contactInput.addEventListener("input", debounce(() => syncText("active_contact", contactInput), 300));
//   if (tagsInput)    tagsInput.addEventListener("input",    debounce(() => syncText("active_tags",    tagsInput),    300));

//   // Industry / Region / Product (selects)
//   if (industrySel) industrySel.addEventListener("change", () => {
//     me.active_industry = industrySel.value || "";
//     fetchWithCurrentFilters(); updateUrlWithFilters(me.saved_filters);
//   });
//   if (regionSel) regionSel.addEventListener("change", () => {
//     me.active_region = regionSel.value || "";
//     fetchWithCurrentFilters(); updateUrlWithFilters(me.saved_filters);
//   });
//   if (productSel) productSel.addEventListener("change", () => {
//     me.active_product = productSel.value || "";
//     fetchWithCurrentFilters(); updateUrlWithFilters(me.saved_filters);
//   });

//   // ===== Advanced Filter Popover (kept your logic, made doctype dynamic) =====
//   const advancedFilterForm = $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first().length
//     ? $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first()
//     : $(wrapper);

//   advancedFilterForm.find('.filter-button').on("click", async function (e) {
//     me._suspend_on_change = true;
//     e.preventDefault();
//     e.stopPropagation();

//     const $btn = $(this);
//     if ($btn.data("bs.popover")) {
//       teardownGuards($btn);
//       $btn.popover("dispose");
//       return;
//     }

//     let popover_content = $('<div class="filter-area">');
//     await frappe.model.with_doctype(DOCTYPE);
//     filter_group = new frappe.ui.FilterGroup({
//       parent: popover_content,
//       doctype: DOCTYPE,
//       on_change: function () {
//         if (me._suspend_on_change) return;
//         me.saved_filters = filter_group.get_filters();
//         fetchWithCurrentFilters();
//         update_filter_button_count($btn, me.saved_filters.length);
//         updateUrlWithFilters(me.saved_filters);
//       }
//     });

//     filter_group.update_filter_button = function () { /* noop to keep UI clean */ };

//     let lastDownInsidePopover = false;
//     let lastDownOnRemove = false;

//     function isDatepickerNode(node) {
//       if (!node) return false;
//       return !!node.closest && !!node.closest(
//         '.flatpickr-calendar, .ui-datepicker, .datepicker, .bootstrap-datetimepicker-widget, .pika-single, .daterangepicker'
//       );
//     }

//     function onDocMouseDownCapture(ev) {
//       const inside = !!ev.target.closest(".filter-popover");
//       const onRemove = !!ev.target.closest(".filter-popover .filter-remove, .filter-popover .remove-filter");
//       const clickedDatepicker =
//         isDatepickerNode(ev.target) ||
//         (ev.composedPath && ev.composedPath().some(n =>
//           n && n.classList && (
//             n.classList.contains('flatpickr-calendar') ||
//             n.classList.contains('ui-datepicker') ||
//             n.classList.contains('datepicker') ||
//             n.classList.contains('bootstrap-datetimepicker-widget') ||
//             n.classList.contains('pika-single') ||
//             n.classList.contains('daterangepicker')
//           )
//         ));
//       lastDownInsidePopover = inside || clickedDatepicker;
//       lastDownOnRemove = onRemove;
//     }

//     function onDatepickerPointerDown(ev) {
//       if (isDatepickerNode(ev.target)) lastDownInsidePopover = true;
//     }

//     document.addEventListener("mousedown", onDocMouseDownCapture, true);
//     document.addEventListener("pointerdown", onDatepickerPointerDown, true);

//     popover_content.on("pointerdown", ".filter-remove, .remove-filter", function (ev) {
//       ev.stopPropagation();
//       lastDownInsidePopover = true;
//       lastDownOnRemove = true;
//     });

//     setTimeout(() => {
//       if (me.saved_filters.length) filter_group.add_filters(me.saved_filters);
//       else filter_group.add_filter(DOCTYPE, "name", "=", "", false);
//     }, 0);

//     let footer = $(`
//       <div class="filter-action-buttons mt-1 flex justify-between items-center">
//         <button class="text-muted add-filter btn btn-xs">+ Add a Filter</button>
//         <div>
//           <button class="btn btn-secondary btn-xs clear-filters mr-2">Clear</button>
//           <button class="btn btn-primary btn-xs apply-filters">Apply</button>
//         </div>
//       </div>
//     `);

//     popover_content.find(".filter-action-buttons").remove();
//     popover_content.append(footer);

//     footer.find('.add-filter').on("click", () => filter_group.add_filter(DOCTYPE, "name", "=", "", false));

//     footer.find('.clear-filters').on("click", () => {
//       if (filter_group) filter_group.clear_filters();
//       me.saved_filters = [];
//       me._suspend_on_change = false;
//       fetchWithCurrentFilters();
//       update_filter_button_count($btn, 0);
//       updateUrlWithFilters([]);
//       closePopover($btn, "clear-filters");
//     });

//     footer.find('.apply-filters').on("click", () => {
//       if (filter_group) {
//         me.saved_filters = filter_group.get_filters();
//         me._suspend_on_change = false;
//         fetchWithCurrentFilters();
//         update_filter_button_count($btn, me.saved_filters.length);
//         updateUrlWithFilters(me.saved_filters);
//       }
//       closePopover($btn, "apply-filters");
//     });

//     $btn.popover({
//       html: true,
//       placement: "bottom",
//       content: popover_content,
//       trigger: "manual",
//       container: document.body,
//       template: `
//         <div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
//           <div class="arrow"></div>
//           <div class="popover-body popover-content"></div>
//         </div>
//       `,
//       popperConfig: {
//         modifiers: [
//           { name: 'offset', options: { offset: [0, 4] } },
//           { name: 'arrow', options: { element: '.arrow', padding: 6 } },
//           { name: 'preventOverflow', options: { padding: 10, altBoundary: true, tether: false } }
//         ]
//       }
//     }).popover("show");

//     // ensure datepickers in popover bind to body to avoid z-index/container issues
//     setTimeout(() => {
//       const calendars = document.querySelectorAll(".filter-popover .flatpickr-input");
//       calendars.forEach(input => {
//         if (input._flatpickr) input._flatpickr.destroy();
//         flatpickr(input, { appendTo: document.body });
//       });
//     }, 300);

//     function isInsidePopoverOrBtn(event) {
//       if ($(event.target).closest(".filter-popover, .filter-button").length) return true;
//       const oe = event.originalEvent || event;
//       if (oe && typeof oe.composedPath === "function") {
//         const path = oe.composedPath();
//         if (path.some(node => node && node.classList && (
//           node.classList.contains('filter-popover') ||
//           node.classList.contains('filter-button') ||
//           node.classList.contains('flatpickr-calendar') ||
//           node.classList.contains('ui-datepicker') ||
//           node.classList.contains('datepicker') ||
//           node.classList.contains('bootstrap-datetimepicker-widget') ||
//           node.classList.contains('pika-single') ||
//           node.classList.contains('daterangepicker')
//         ))) return true;
//       }
//       if (isDatepickerNode(event.target)) return true;
//       return false;
//     }

//     const onDocClick = function (event) {
//       const pathInside = isInsidePopoverOrBtn(event);
//       if (lastDownOnRemove || lastDownInsidePopover || pathInside) {
//         lastDownOnRemove = false;
//         return;
//       }
//       closePopover($btn, "outside-click");
//     };

//     $(document).on("click.filterPopover", onDocClick);
//     $btn.data("guardHandlers", { onDocClick, onDocMouseDownCapture, onDatepickerPointerDown });

//     function closePopover($btn, reason) {
//       teardownGuards($btn);
//       $btn.popover("dispose");
//     }

//     function teardownGuards($btn) {
//       const guards = $btn.data("guardHandlers");
//       if (guards) {
//         $(document).off("click.filterPopover", guards.onDocClick);
//         document.removeEventListener("mousedown", guards.onDocMouseDownCapture, true);
//         document.removeEventListener("pointerdown", guards.onDatepickerPointerDown, true);
//         $btn.removeData("guardHandlers");
//       }
//     }
//   });

//   // ===== External Clear (top X) =====
//   if (clearFilterButton) {
//     clearFilterButton.addEventListener("click", () => {
//       if (filter_group) filter_group.clear_filters();
//       me.saved_filters = [];
//       clearBasicFilterUI();
//       me._fetch_in_progress = false;
//       fetchWithCurrentFilters();
//       localStorage.removeItem(LS_KEY);
//       update_filter_button_count($(advancedFilterForm).find('.filter-button'), 0);
//       updateUrlWithFilters([]);
//     });
//   }

//   // ===== UI Helpers =====
//   function update_filter_button_count($btn, count) {
//     let $label = $btn.find(".button-label");
//     if ($label && $label.length) $label.text(count > 0 ? `Filter (${count})` : "Filter");
//   }

//   // ===== URL Updater (extended with all basic fields) =====
//   function updateUrlWithFilters(filters) {
//     try {
//       const newUrl = new URL(window.location.href);

//       // Basic selects
//       const statusVal       = statusFilter ? statusFilter.value : "";
//       const priorityVal     = priorityFilter ? priorityFilter.value : "";
//       const workingAgentVals= workingAgentFilter ? (me.getSelectValues?.(workingAgentFilter) || []) : [];

//       // Entity/text & ranges
//       const params = {
//         status: statusVal,
//         priority: priorityVal,
//         working_agent: workingAgentVals.join(","),
//         created_from: asDate(createdFrom),
//         created_to: asDate(createdTo),
//         modified_from: asDate(modifiedFrom),
//         modified_to: asDate(modifiedTo),
//         close_from: asDate(closeFrom),
//         close_to: asDate(closeTo),
//         deal_min: (parseNumber(dealMin) ?? "").toString(),
//         deal_max: (parseNumber(dealMax) ?? "").toString(),
//         account: (accountInput?.value || "").trim(),
//         contact: (contactInput?.value || "").trim(),
//         industry: (industrySel?.value || ""),
//         region: (regionSel?.value || ""),
//         product: (productSel?.value || ""),
//         tags: (tagsInput?.value || "").trim()
//       };

//       Object.entries(params).forEach(([k, v]) => {
//         if (v && v !== "null" && v !== "undefined") newUrl.searchParams.set(k, v);
//         else newUrl.searchParams.delete(k);
//       });

//       // Advanced filters as JSON
//       if (filters && filters.length) {
//         const encoded = encodeURIComponent(JSON.stringify(filters));
//         newUrl.searchParams.set("filters", encoded);
//       } else {
//         newUrl.searchParams.delete("filters");
//       }

//       window.history.replaceState({}, "", newUrl.toString());
//       // console.log("🔄 URL updated:", newUrl.toString());
//     } catch (err) {
//       console.error("❌ Failed to update URL:", err);
//     }
//   }
// }

bindFilterEvents() {
  const me = this;
  const wrapper = this.page.wrapper[0] || this.page.wrapper;

  // ========= CONFIG =========
  const DOCTYPE = me.filter_doctype || "Opportunity";
  const LS_KEY  = `${DOCTYPE.toLowerCase()}_theme_last_filters`;

  // ========= BASIC FILTERS =========
  const statusFilter      = wrapper.querySelector('[data-table-filter="status"]');
  const probabilityFilter = wrapper.querySelector('[data-table-filter="probability"]');

  const filterButton      = wrapper.querySelector('.filter-button');
  const clearFilterButton = wrapper.querySelector('.filter-x-button');

  // ========= OWNER DROPDOWN =========
 // ========= OWNER DROPDOWN =========
const ownerChip = document.getElementById("filterowner");
const dropdown  = document.getElementById("owner-dropdown");
const search    = document.getElementById("owner-search-dropdown");

me.selectedOwners = Array.isArray(me.selectedOwners) ? me.selectedOwners : [];

// Place and flip the dropdown depending on space
const placeOwnerDropdown = () => {
  if (!ownerChip || !dropdown || dropdown.style.display === "none") return;
  const rect = ownerChip.getBoundingClientRect();
  const vh   = window.innerHeight;
  // Ensure dropdown isn't narrower than trigger
  dropdown.style.minWidth = rect.width + "px";

  // Flip above when not enough room below
  const belowSpace = vh - rect.bottom;
  const want = Math.min(vh * 0.5, 360) + 48; // list + sticky search approx
  if (belowSpace < want && rect.top > want) {
    dropdown.classList.add("owner-menu--above");
  } else {
    dropdown.classList.remove("owner-menu--above");
  }
};

ownerChip?.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = dropdown.style.display === "block";
  dropdown.style.display = open ? "none" : "block";
  if (!open) {
    if (search) { search.value = ""; setTimeout(() => search.focus(), 20); }
    me.renderOwners("");        // fresh paint
    placeOwnerDropdown();       // position smartly
  }
});

// Close on outside click
document.addEventListener("click", (e) => {
  if (!dropdown || dropdown.style.display === "none") return;
  if (dropdown.contains(e.target) || ownerChip.contains(e.target)) return;
  dropdown.style.display = "none";
});

// Keep position on resize/scroll
window.addEventListener("resize", placeOwnerDropdown, { passive: true });
window.addEventListener("scroll", placeOwnerDropdown, { passive: true });

// Debounced search
const debounce1 = (fn, ms = 180) => { let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
search?.addEventListener("input", debounce1((e) => {
  e.stopPropagation();
  me.renderOwners(e.target.value || "");
}, 180));

// Optional: close with Escape
dropdown?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    dropdown.style.display = "none";
    ownerChip?.focus?.();
  }
});

// IMPORTANT: remove old checkbox-based change listener if present,
// because your renderOwners() uses clickable <div> rows (no inputs).
// If you kept a `dropdown.addEventListener("change", ...)` for ".owner-option",
// please delete that block.

  // ========= ENTITY + DATE FILTERS =========
  const createdFrom  = wrapper.querySelector('[data-table-filter="created_from"]');
  const createdTo    = wrapper.querySelector('[data-table-filter="created_to"]');
  const modifiedFrom = wrapper.querySelector('[data-table-filter="modified_from"]');
  const modifiedTo   = wrapper.querySelector('[data-table-filter="modified_to"]');
  const closeFrom    = wrapper.querySelector('[data-table-filter="close_from"]');
  const closeTo      = wrapper.querySelector('[data-table-filter="close_to"]');

  const dealMin = wrapper.querySelector('[data-table-filter="deal_min"]');
  const dealMax = wrapper.querySelector('[data-table-filter="deal_max"]');

  const accountInput = wrapper.querySelector('[data-table-filter="account"]');
  const contactInput = wrapper.querySelector('[data-table-filter="contact"]');
  const industrySel  = wrapper.querySelector('[data-table-filter="industry"]');
  const regionSel    = wrapper.querySelector('[data-table-filter="region"]');
  const productSel   = wrapper.querySelector('[data-table-filter="product"]');
  const tagsInput    = wrapper.querySelector('[data-table-filter="tags"]');

  // ========= HELPERS =========
  const debounce = (fn, wait = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
  const parseNumber = (el) => el && el.value ? Number(el.value.replace(/,/g,'')) : null;
  const asDate = (el) => (el && el.value) ? el.value : "";

  function validateRanges() {
    const min = parseNumber(dealMin);
    const max = parseNumber(dealMax);
    if (min != null && max != null && min > max) {
      me.showToast?.("Deal min cannot exceed max", "warning");
      return false;
    }
    const ranges = [
      {from:asDate(createdFrom), to:asDate(createdTo), name:"Created"},
      {from:asDate(modifiedFrom),to:asDate(modifiedTo),name:"Modified"},
      {from:asDate(closeFrom),   to:asDate(closeTo),   name:"Expected Close"}
    ];
    for (let r of ranges) {
      if (r.from && r.to && r.from > r.to) {
        me.showToast?.(`${r.name}: start > end`, "warning");
        return false;
      }
    }
    return true;
  }

  // ========= BUILD BASIC FILTERS =========
  function basicFilters() {
    const f = [];
    const F = (field, op, val) => f.push([DOCTYPE, field, op, val]);

    if (me.active_status) F("status", "=", me.active_status);

    if (me.active_probability) {
      const m = String(me.active_probability).match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) F("probability", "between", [Number(m[1]), Number(m[2])]);
      else   F("probability", "=", Number(me.active_probability));
    }

    if (me.selectedOwners.length)
      F("owner", "in", me.selectedOwners);

    if (asDate(createdFrom))  F("creation", ">=", asDate(createdFrom));
    if (asDate(createdTo))    F("creation", "<=", asDate(createdTo));
    if (asDate(modifiedFrom)) F("modified", ">=", asDate(modifiedFrom));
    if (asDate(modifiedTo))   F("modified", "<=", asDate(modifiedTo));
    if (asDate(closeFrom))    F("expected_closing", ">=", asDate(closeFrom));
    if (asDate(closeTo))      F("expected_closing", "<=", asDate(closeTo));

    const dmin = parseNumber(dealMin), dmax = parseNumber(dealMax);
    if (dmin != null) F("amount", ">=", dmin);
    if (dmax != null) F("amount", "<=", dmax);

    if (me.active_account)  F("party_name", "like", `%${me.active_account}%`);
    if (me.active_contact)  F("contact_person", "like", `%${me.active_contact}%`);
    if (me.active_industry) F("industry", "=", me.active_industry);
    if (me.active_region)   F("territory", "=", me.active_region);
    if (me.active_product)  F("item_group", "=", me.active_product);
    if (me.active_tags)     F("_user_tags", "like", `%${me.active_tags}%`);

    return f;
  }

  function fetchWithFilters() {
    const merged = [...basicFilters(), ...(me.saved_filters || [])];
    me.fetch_list_data({
      reset: true,
      saved_filters: merged,
      override_filters: {
        status: me.active_status || "",
        probability: me.active_probability || "",
        owners: me.selectedOwners
      }
    });
  }

  function updateUrl() {
    const newUrl = new URL(window.location.href);
    const params = {
      status: me.active_status || "",
      probability: me.active_probability || "",
      owners: me.selectedOwners.join(","),
      created_from: asDate(createdFrom),
      created_to: asDate(createdTo),
      modified_from: asDate(modifiedFrom),
      modified_to: asDate(modifiedTo),
      close_from: asDate(closeFrom),
      close_to: asDate(closeTo),
      deal_min: parseNumber(dealMin) ?? "",
      deal_max: parseNumber(dealMax) ?? "",
      account: accountInput?.value || "",
      contact: contactInput?.value || "",
      industry: industrySel?.value || "",
      region: regionSel?.value || "",
      product: productSel?.value || "",
      tags: tagsInput?.value || ""
    };

    Object.entries(params).forEach(([k,v])=>{
      if (v) newUrl.searchParams.set(k,v);
      else newUrl.searchParams.delete(k);
    });

    if (me.saved_filters?.length)
      newUrl.searchParams.set("filters", encodeURIComponent(JSON.stringify(me.saved_filters)));
    else
      newUrl.searchParams.delete("filters");

    window.history.replaceState({}, "", newUrl.toString());
  }

  // ========= LISTENERS =========

  statusFilter?.addEventListener("change", () => {
    me.active_status = statusFilter.value || "";
    fetchWithFilters();
    updateUrl();
  });

  probabilityFilter?.addEventListener("change", () => {
    me.active_probability = probabilityFilter.value || "";
    fetchWithFilters();
    updateUrl();
  });

  const onDate = () => {
    if (!validateRanges()) return;
    fetchWithFilters();
    updateUrl();
  };

  [createdFrom, createdTo, modifiedFrom, modifiedTo, closeFrom, closeTo]
    .forEach(el => el?.addEventListener("change", onDate));

  const onDeal = () => {
    if (!validateRanges()) return;
    fetchWithFilters();
    updateUrl();
  };
  dealMin?.addEventListener("input", onDeal);
  dealMax?.addEventListener("input", onDeal);

  const bindText = (key, el) =>
    el?.addEventListener("input", debounce(()=>{
      me[key] = el.value.trim();
      fetchWithFilters();
      updateUrl();
    },300));

  bindText("active_account", accountInput);
  bindText("active_contact", contactInput);
  bindText("active_tags", tagsInput);

  industrySel?.addEventListener("change", () => { me.active_industry = industrySel.value; fetchWithFilters(); updateUrl(); });
  regionSel?.addEventListener("change",   () => { me.active_region   = regionSel.value;   fetchWithFilters(); updateUrl(); });
  productSel?.addEventListener("change",  () => { me.active_product  = productSel.value;  fetchWithFilters(); updateUrl(); });

  // ========= ADVANCED FILTER POPUP (unchanged) =========
  const advancedFilterForm = $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first().length
    ? $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first()
    : $(wrapper);

  advancedFilterForm.find(".filter-button").on("click", async function(evt){
    me._suspend_on_change = true;
    evt.preventDefault(); evt.stopPropagation();

    const $btn = $(this);
    if ($btn.data("bs.popover")) {
      teardown();
      $btn.popover("dispose");
      return;
    }

    let pop = $('<div class="filter-area">');
    await frappe.model.with_doctype(DOCTYPE);

    let FG = new frappe.ui.FilterGroup({
      parent: pop,
      doctype: DOCTYPE,
      on_change: function () {
        if (me._suspend_on_change) return;
        me.saved_filters = FG.get_filters();
        fetchWithFilters();
        updateCount($btn, me.saved_filters.length);
        updateUrl();
      }
    });

    FG.update_filter_button = function(){};

    setTimeout(()=>{
      if (me.saved_filters.length) FG.add_filters(me.saved_filters);
      else FG.add_filter(DOCTYPE,"name","=","",false);
    },0);

    let footer = $(`
      <div class="filter-action-buttons mt-1 flex justify-between items-center">
        <button class="btn btn-xs text-muted add-filter">+ Add Filter</button>
        <div>
          <button class="btn btn-secondary btn-xs clear-filters mr-2">Clear</button>
          <button class="btn btn-primary btn-xs apply-filters">Apply</button>
        </div>
      </div>
    `);

    pop.append(footer);

    footer.find(".add-filter").on("click",()=>FG.add_filter(DOCTYPE,"name","=","",false));
    footer.find(".clear-filters").on("click",()=>{
      FG.clear_filters();
      me.saved_filters=[];
      me._suspend_on_change=false;
      fetchWithFilters();
      updateCount($btn,0);
      updateUrl();
      close();
    });
    footer.find(".apply-filters").on("click",()=>{
      me.saved_filters = FG.get_filters();
      me._suspend_on_change=false;
      fetchWithFilters();
      updateCount($btn,me.saved_filters.length);
      updateUrl();
      close();
    });

    $btn.popover({
      html:true,
      placement:"bottom",
      content:pop,
      trigger:"manual",
      container:document.body,
      template:`
        <div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
          <div class="arrow"></div>
          <div class="popover-body popover-content"></div>
        </div>
      `,
      popperConfig:{
        modifiers:[
          {name:'offset', options:{offset:[0,4]}},
          {name:'preventOverflow', options:{padding:10, altBoundary:true}}
        ]
      }
    }).popover("show");

    function close(){ teardown(); $btn.popover("dispose"); }
    function teardown(){
      $(document).off("click.filterPopover");
    }
    function updateCount($b,c){
      let lbl=$b.find(".button-label");
      if (lbl && lbl.length) lbl.text(c>0?`Filter (${c})`:"Filter");
    }
  });

  // ========= CLEAR BUTTON =========
  clearFilterButton?.addEventListener("click",()=>{
    me.saved_filters=[];
    me.selectedOwners=[];
    me.active_status="";
    me.active_probability="";
    [
      statusFilter,probabilityFilter,industrySel,regionSel,productSel,
      createdFrom,createdTo,modifiedFrom,modifiedTo,closeFrom,closeTo,
      dealMin,dealMax,accountInput,contactInput,tagsInput
    ].forEach(el=>{ if(el) el.value="";});
    fetchWithFilters();
    updateUrl();
  });
}


updateOwnerChip() {
		const display = document.getElementById("owner-display");
		if (!display) return;

		const selected = this.selectedOwners || [];
		const allOwners = this.allOwners || [];

		if (selected.length === 0) {
			display.textContent = "working agents";
			const container = document.getElementById("filterworkingagent");
			if (container) container.classList.add("placeholder");
		} else if (selected.length === 1) {
			const owner = allOwners.find(a => (a.value || a) === selected[0]);
			const label = typeof owner === "string" ? owner : (owner?.label || owner?.value || selected[0]);
			display.textContent = label;
			const container = document.getElementById("filterowner");
			if (container) container.classList.remove("placeholder");
		} else {
			display.textContent = `${selected.length} owners selected`;
			const container = document.getElementById("filterowner");
			if (container) container.classList.remove("placeholder");
		}
	}


  initializeOwnerDropdown() {
    this.updateOwnerChip(); // initial text
    this.renderOwners("");  // initial list
  }

renderOwners(filterText = "") {
  const list = document.getElementById("owner-options-dropdown");
  if (!list) return;
  list.innerHTML = "";

  const term = (filterText || "").toLowerCase();
  const all = this.allOwners || [];
  let has = false;

  all.forEach(o => {
    const val = typeof o === "string" ? o : (o.value ?? "");
    const lbl = typeof o === "string" ? o : (o.label ?? val);
    if (term && !String(lbl).toLowerCase().includes(term)) return;

    has = true;
    const isSelected = this.selectedOwners.includes(val);

    const row = document.createElement("div");
    row.className = "working-agent-option" + (isSelected ? " is-selected" : "");
    row.setAttribute("data-owner", val);

    // name label
    const label = document.createElement("span");
    label.className = "owner-name";
    label.textContent = lbl;

    // right-side check icon (only visible when selected by CSS)
    const check = document.createElement("i");
    check.className = "owner-check fa fa-check";

    row.appendChild(label);
    row.appendChild(check);

    // hover color handled purely by CSS; click toggles selection
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = this.selectedOwners.indexOf(val);
      if (idx >= 0) this.selectedOwners.splice(idx, 1);
      else this.selectedOwners.push(val);

      // visual state
      const sel = this.selectedOwners.includes(val);
      row.classList.toggle("is-selected", sel);

      // update chip + query
      this.updateOwnerChip();
      this.updateUrl();
      this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
    });

    list.appendChild(row);
  });

  if (!has) {
    const empty = document.createElement("div");
    empty.textContent = "No owners found";
    empty.style.cssText = "padding: 20px 12px; text-align:center; color:#999; font-size:13px;";
    list.appendChild(empty);
  }
}

  updateOwnerChip() {
    const chip = document.getElementById("owner-display");
    const container = document.getElementById("filterowner");
    if (!chip || !container) return;
    if (!this.selectedOwners.length) {
      chip.textContent = "owners";
      container.classList.add("placeholder");
    } else if (this.selectedOwners.length === 1) {
      const sel = this.allOwners.find(o => (o.value || o) === this.selectedOwners[0]);
      chip.textContent = typeof sel === "string" ? sel : (sel?.label || sel?.value || this.selectedOwners[0]);
      container.classList.remove("placeholder");
    } else {
      chip.textContent = `${this.selectedOwners.length} owners selected`;
      container.classList.remove("placeholder");
    }
  }

  // -------- URL sync + first fetch --------
  applyUrlFilters() {
    // restore from localStorage if URL empty
    let qs = localStorage.getItem(OPP_CFG.LS.last_filters) || "";
    if (!window.location.search && qs) {
      window.history.replaceState({}, "", window.location.pathname + qs);
    }

    const params = new URLSearchParams(window.location.search);
    const status = params.get("status") || "";
    const probability = params.get("probability") || "";
    const owners_raw = params.get("owners") || "";
    const owners = owners_raw ? owners_raw.split(",").map(v => v.trim()).filter(Boolean) : [];
    const filters_encoded = params.get("filters") || "";

    const wrapper = this.page.wrapper[0] || this.page.wrapper;
    const statusSel = wrapper.querySelector('#filterStatus');
    const probSel = wrapper.querySelector('#filterProbability');
    const owner= wrapper.querySelector('[data-table-range-filter="owner"]');

    if (statusSel) { statusSel.value = status; if (!status) statusSel.classList.add("placeholder"); else statusSel.classList.remove("placeholder"); }
    if (probSel) { probSel.value = probability; if (!probability) probSel.classList.add("placeholder"); else probSel.classList.remove("placeholder"); }
    if (owner) {
			this.selectedOwners = owners;
			this.updateOwnerChip();
		}

    this.active_status = status;
    this.active_probability = probability;
    this.selectedOwners = owners;
    this.updateOwnerChip();

    // advanced filters
    this.saved_filters = [];
    if (filters_encoded) {
      try {
        const decoded = decodeURIComponent(filters_encoded);
        const parsed = JSON.parse(decoded);
        this.saved_filters = Array.isArray(parsed) ? parsed : [];
      } catch (e) { console.warn("Failed to parse adv filters:", e); }
    }

    this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
  }

  updateUrl() {
    try {
      const newUrl = new URL(window.location.href);
      // basic filters
      if (this.active_status) newUrl.searchParams.set("status", this.active_status);
      else newUrl.searchParams.delete("status");

      if (this.active_probability) newUrl.searchParams.set("probability", this.active_probability);
      else newUrl.searchParams.delete("probability");

      if ((this.selectedOwners || []).length) {
        newUrl.searchParams.set("owners", this.selectedOwners.join(","));
      } else {
        newUrl.searchParams.delete("owners");
      }

      // advanced filters (if you wire the popover, encode & set here)
      if ((this.saved_filters || []).length) {
        const encoded = encodeURIComponent(JSON.stringify(this.saved_filters));
        newUrl.searchParams.set("filters", encoded);
      } else {
        newUrl.searchParams.delete("filters");
      }

      window.history.replaceState({}, "", newUrl.toString());
    } catch (err) {
      console.error("URL update failed:", err);
    }
  }

  // -------- HELPERS --------
  initials(name) {
    const p = (name || "User").trim().split(/\s+/);
    return ((p[0]?.[0] || "U") + (p[p.length-1]?.[0] || "")).toUpperCase();
  }
  formatModified(dateString) {
    if (!dateString) return "";
    const modifiedDate = new Date(dateString);
    const now = new Date();
    const diffMs = now - modifiedDate;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (years>0) return years + "y";
    if (months>0) return months + "m";
    if (days>0) return days + "d";
    if (hours>0) return hours + "h";
    if (minutes>0) return minutes + "m";
    return seconds + "s";
  }
  formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
      <small class="text-muted">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
  }
  getStageClass(stage) {
    switch (stage) {
      case "Open": return "open1";
      case "Quotation": return "pending";
      case "Converted": return "resolved";
      case "Lost": return "closed1";
      case "On Hold": return "on_hold";
      default: return "bg-light";
    }
  }
}


// ---- TEMPLATE ----
frappe.opportunitydata_page_template = {
  body: `
    <div class="wrapper opportunity-data-wrapper">

      <!-- LIST VIEW -->
      <div class="opportunity-data-list">
        <div class="row">
          <div class="col-12">
            <div class="page-title-head d-flex align-items-center">
              <div class="flex-grow-1">
                <h3 class="fs-xl fw-bold m-0">Opportunities</h3>
              </div>
              <div class="text-end">
                <ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
                  <li class="breadcrumb-item"><a href="javascript:void(0);">CRM</a></li>
                  <li class="breadcrumb-item active">Opportunities</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="row mt-3">
          <div class="col-12">
            <div class="controls-wrapper">
              <div class="controls">
                <div class="left-controls">
                  <select id="filterStatus" class="control-select placeholder" aria-label="Status">
                    <option value="">status</option>
                    <option value="Open">Open</option>
                    <option value="Quotation">Quotation</option>
                    <option value="Converted">Converted</option>
                    <option value="Lost">Lost</option>
                    <option value="On Hold">On Hold</option>
                  </select>

                  <select id="filterProbability" class="control-select placeholder" data-placeholder="probability">
                    <option value="">probability</option>
                    <option value="0-25">0–25%</option>
                    <option value="25-50">25–50%</option>
                    <option value="50-75">50–75%</option>
                    <option value="75-100">75–100%</option>
                  </select>

                  <div class="working-agent-dropdown-wrapper">
                    <div class="control-select placeholder" id="filterowner" data-placeholder="owners">
                      <span id="owner-display">owners</span>
                    </div>
                    <div id="owner-dropdown" class="working-agent-dropdown">
                      <div class="working-agent-search-box">
                        <input type="text" id="owner-search-dropdown" placeholder="Search owners..." />
                      </div>
                      <div id="owner-options-dropdown"></div>
                    </div>
                  </div>
                </div>

                <div class="right-controls">
                <div class="btn-group filter-actions">
										<button class="btn btn-default btn-sm filter-button" title="Filters">
											<svg class="es-icon es-line icon-sm"><use href="#es-line-filter"></use></svg>
											<span class="button-label">Filters</span>
										</button>
										<button class="btn btn-default btn-sm filter-x-button" title="Clear filters">
											<svg class="es-icon es-line icon-sm"><use href="#es-small-close"></use></svg>
										</button>
									</div>
                  <!-- Optional: add advanced filter popover button, actions, or new -->
                  <a id="new-opportunity-btn" href="/app/opportunity-data/new" class="btn btn-sm btn-primary1 mr-2">
                    <i class="fa fa-plus me-1"></i> New Opportunity
                  </a>
                </div>
              </div>
            </div>

            <!-- Table -->
            <div class="table-container mt-2">
              <table class="opportunities-table tickets-table">
                <thead>
                  <tr>
                    <th><input id="selectAllOpps" type="checkbox" /></th>
                    <th>ID</th>
                    <th title="Subject">Subject</th>
                    <th title="Customer/Lead">Party</th>
                    <th title="Stage">Stage</th>
                    <th title="Probability">Prob %</th>
                    <th title="Amount">Amount</th>
                    <th title="Expected Close">Expected Close</th>
                    <th title="Owner">Owner</th>
                    <th title="Assigned To">Assigned To</th>
                    <th class="text-center ellipsis" id="count-header" title="0 of 0">
                      <span id="visible-count">0</span> of <span id="total-count">0</span>
                    </th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>

            <!-- Paging -->
            <div class="d-flex justify-content-between align-items-center mt-2">
              <div class="list-paging-area d-flex justify-content-between align-items-center w-100">
                <div class="p-2">
                  <div class="btn-group">
                    <button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="20">20</button>
                    <button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="100">100</button>
                    <button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="500">500</button>
                    <button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="2500">2500</button>
                  </div>
                </div>
                <div class="p-2">
                  <button class="btn btn-default1 btn-light btn-more btn-sm">Load More</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- DETAILS VIEW -->
      <!-- DETAILS VIEW -->
<div class="opportunity-data-details d-none">
  <div class="row">
    <div class="col-12">
      <div class="ticket-header">
        <div class="ticket-breadcrumb">
          <h3 class="page-title">Opportunities</h3>
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="javascript:void(0)">CRM</a></li>
            <li class="breadcrumb-item"><a href="/app/opportunity-data">Opportunities</a></li>
          </ol>
        </div>

        <div class="ticket-meta mt-3">
          <div class="ticket-title">
            <span id="opp-name" class="ticket-id"></span>
            <span class="separator">—</span>
            <span id="opp-title" class="ticket-subject"></span>
          </div>

          <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
            <div id="doc-details-assign-users"></div>
            <div class="dropdown" id="doc-status-actions-dropdown">
              <button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
                Change Stage
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" data-action="set_open">Open</a></li>
                <li><a class="dropdown-item" href="#" data-action="set_quotation">Quotation</a></li>
                <li><a class="dropdown-item" href="#" data-action="set_converted">Converted</a></li>
                <li><a class="dropdown-item" href="#" data-action="set_lost">Lost</a></li>
                <li><a class="dropdown-item" href="#" data-action="set_on_hold">On Hold</a></li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Two-column layout like Tickets -->
  <div class="row">
    <div class="leftcol col-lg-8 col-12">
      <div class="card" style="border:none;">
        <div class="card-header ticket-card-header">
          <div class="ticket-header-left">
            <h5 class="ticket-subject-line">
              <span id="opp-title-2" class="ticket-subject"></span>
              <span class="mx-1">–</span>
              <span id="probability_badge" class="priority-badge"></span>
            </h5>
          </div>
          <div class="ticket-header-right">
            <span id="doc-status" class="status-badge"></span>
            <div class="dropdown" id="doc-actions-dropdown">
              <button class="btn btn-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
                Actions
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" data-action="assign">Assign ToDo</a></li>
                <li><a class="dropdown-item" href="#" data-action="email">Send Email</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div class="card-body">

          <div id="docdatadisplay" class="mb-3"></div>

          <!-- Attachments -->
          <div class="row mb-4" id="attachments-section">
            <div class="col-12">
              <div class="d-flex align-items-center gap-1">
                <h6 class="text-uppercase text-muted1 mb-0">Attachments</h6>
                <button id="add-attachment-btn" class="btn btn-sm btn-outline-primary btn-default2" title="Add attachment">
                  <i class="fa fa-plus"></i>
                </button>
              </div>
              <div id="doc-attachments-list" class="d-flex flex-wrap gap-1 mt-2 small text-muted">
                <span class="text-muted">No attachments yet</span>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div class="mb-4" id="description-section">
            <div class="d-flex align-items-center justify-content-between mb-1" style="gap: 6px;">
              <h6 class="text-uppercase text-muted mb-0" style="font-weight: 600; letter-spacing: 0.3px;">
                Description
              </h6>
            </div>
            <div id="description-container" class="p-2" style="border:1px solid #E7E9EB; border-radius:5px;">
              <p class="mb-1" id="description"></p>
            </div>
          </div>

          <!-- Comments + Email -->
          <div class="mb-4">
            <div class="comment-section mt-3">
              <div class="comment-box">
                <div class="comment-input-wrapper">
                  <div class="comment-input-header"><span>Comments</span></div>
                  <div class="comment-input-container">
                    <span class="avatar avatar-medium" title="">
                      <div class="avatar-frame standard-image"></div>
                    </span>
                    <div class="frappe-control col" data-fieldtype="Comment" data-fieldname="comment">
                      <div class="ql-container ql-bubble" style="position: relative;">
                        <div id="new-comment-input" class="ql-editor ql-blank" contenteditable="true" data-placeholder="Type a reply / comment"><p><br></p></div>
                        <div class="ql-mention-list-container" style="display: none; position: absolute;"><ul class="ql-mention-list"></ul></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="comment-actions d-flex justify-content-between gap-2 mt-2">
                  <button id="add-comment-btn" class="btn btn-primary btn-default2 btn-comment btn-xs">Comment</button>
                  <button class="btn btn-sm btn-primary btn-default2 btn-comment" id="email-send">+ New Email</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Activity -->
          <div class="mb-4">
            <h6 class="text-uppercase text-muted mb-4 activity">Activity:</h6>
            <div class="timeline" id="activity-timeline"><p class="text-muted">Loading activity...</p></div>
          </div>

        </div>
      </div>
    </div>

    <!-- Right column (optional sticky card area) -->
    <div class="rightcol col-lg-4 d-none d-lg-flex">
      <div class="card sla-compare-card p-2 mb-3 rounded shadow-sm"></div>
    </div>

    <!-- Mobile mirror (optional) -->
    <div class="modal fade" id="mobile-sla-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header p-3">
            <h5 class="modal-title"></h5>
            <div class="modal-actions ms-auto d-flex align-items-center gap-2"></div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
              <i class="fa fa-close"></i>
            </button>
          </div>
          <div class="modal-body p-0"></div>
        </div>
      </div>
    </div>

  </div>
</div>

      <!-- NEW VIEW -->
      <div class="opportunity-data-new d-none">
        <div class="row">
          <div class="col-12">
            <div class="ticket-header">
              <div class="ticket-breadcrumb">
                <h3 class="page-title">Opportunities</h3>
                <ol class="breadcrumb">
                  <li class="breadcrumb-item"><a href="javascript:void(0)">CRM</a></li>
                  <li class="breadcrumb-item"><a href="/app/opportunity-data">Opportunities</a></li>
                </ol>
              </div>
              <div class="mt-2 text-muted">Build a quick “New Opportunity” form here (optional).</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `
};
