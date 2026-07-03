frappe.pages['cof-list'].on_page_load = function (wrapper) {
	new CofListPage(wrapper);
};

frappe.pages['cof-list'].on_page_show = function (wrapper) {
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	$("body").attr("data-route", "cof-list");
	ensureCofListAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.coflist_page || frappe.coflist_page.wrapper !== pageWrapper) {
				frappe.coflist_page = new CofListPage(pageWrapper);
			}
			frappe.coflist_page.render();
		});
	});
};

function ensureCofListAssets() {
	const stylesheets = [
		"https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap",
		"https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css",
	];

	stylesheets.forEach((href) => {
		if (document.querySelector(`link[href="${href}"]`)) return;
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		document.head.appendChild(link);
	});
}

class CofListPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: "",
			single_column: true,
		});
		this.view = "list";
		this.hasFetched = false;
		this.hasFetchedOwners = false;
		this.isLoading = false;
		this.searchText = "";
		this.statusFilter = "";
		this.selectedCustomers = [];
		this.selectedOwners = [];
		this.ownerOptions = [];
		this.saved_filters = [];
		this.filterDoctype = "Customer Order Form";
		this.activeFilterPopoverButton = null;
		this.amountSortDir = "";
		this.pageSize = 20;
		this.pageStep = 20;
		this.selectedRecord = null;
		this.records = [];
		this.detailRecord = null;
		this.detailActivities = [];
		this.detailAttachments = [];
		this.isLoadingDetail = false;
		this.activeTab = "notes";
		this.activeFilter = "all";
		this.currentStage = 0;
		this.tabConfig = {
			notes: { label: "+ Add Note", icon: "ti-notes", inputId: "inputNotes" },
			calls: { label: "+ Call", icon: "ti-phone", inputId: "inputCalls" },
			appointments: { label: "+ Appointment", icon: "ti-calendar-event", inputId: "inputAppointments" },
			comments: { label: "+ Add Comment", icon: "ti-message-circle", inputId: "inputComments" },
			attachments: { label: null, icon: null, inputId: null },
		};
		this.wfStages = [
			{
				status: "Draft",
				dot: "#9ca3af",
				label: "Current Stage: Draft",
				actions: [{ label: "Submit for Approval", desc: "Move to pending review", icon: "ti-send", color: "#3b7ef8", bg: "rgba(59,126,248,0.1)", next: 1 }],
			},
			{
				status: "Pending Approval",
				dot: "#d97706",
				label: "Current Stage: Pending Approval",
				actions: [
					{ label: "Approve", desc: "Mark as approved and proceed", icon: "ti-circle-check", color: "#16a34a", bg: "rgba(22,163,74,0.1)", next: 2 },
					{ label: "Reject", desc: "Send back with comments", icon: "ti-circle-x", color: "#dc2626", bg: "rgba(220,38,38,0.1)", next: 3 },
				],
			},
			{
				status: "Approved",
				dot: "#16a34a",
				label: "Current Stage: Approved",
				actions: [{ label: "Convert to Order", desc: "Create sales order", icon: "ti-shopping-cart", color: "#3b7ef8", bg: "rgba(59,126,248,0.1)", next: 4 }],
			},
			{
				status: "Rejected",
				dot: "#dc2626",
				label: "Current Stage: Rejected",
				actions: [{ label: "Revise & Resubmit", desc: "Edit and submit again", icon: "ti-refresh", color: "#d97706", bg: "rgba(217,119,6,0.1)", next: 0 }],
			},
			{ status: "Order Created", dot: "#16a34a", label: "Current Stage: Order Created", actions: [] },
		];
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}

			this.$content = $content;
			const route = (frappe.get_route && frappe.get_route()) || [];
			const routeName = route.length > 1 ? String(route[1] || "").trim() : "";

			this.loadDataAndRender(routeName);
		};

		waitForContent();
	}

	loadDataAndRender(routeName = "") {
		if (this.isLoading) return;
		this.isLoading = true;
		this.renderListLoading();

		Promise.all([this.fetchRecords(), this.fetchOwnerOptions()])
			.then(() => {
				if (routeName === "new") {
					this.selectedRecord = null;
					this.detailRecord   = null;
					return this.renderNewView();
				}
				if (routeName && routeName !== "new") {
					this.selectedRecord = this.records.find((row) => row.id === routeName) || null;
					this.detailRecord = null;
				} else {
					this.selectedRecord = null;
					this.detailRecord = null;
				}

				if (this.selectedRecord) {
					this.renderDetailView();
					return;
				}

				this.applyUrlFilters();
				this.renderListView();
			})
			.finally(() => {
				this.isLoading = false;
			});
	}

	fetchOwnerOptions() {
		if (this.hasFetchedOwners) return Promise.resolve();

		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "User",
					fields: ["name", "full_name"],
					filters: { enabled: 1 },
					limit_page_length: 2000,
					order_by: "full_name asc",
				},
				callback: (response) => {
					const rows = (response && response.message) || [];
					this.ownerOptions = rows.map((row) => ({
						value: row.name,
						label: row.full_name ? `${row.full_name} (${row.name})` : row.name,
					}));
					this.hasFetchedOwners = true;
					resolve();
				},
				error: () => {
					this.ownerOptions = [];
					resolve();
				},
			});
		});
	}

	renderListLoading() {
		this.page.set_title("Customer Order Forms");
		document.title = "Customer Order Forms";
		this.$content.html(
			`<div class="cof-list-view"><div class="card cof-list-card"><div class="cof-loading">Loading customer order forms...</div></div></div>`
		);
	}

	renderNewView() {
		this.view = "new";
		this.page.set_title("New Customer Order Form");
		document.title = "New Customer Order Form";

		const stash = frappe._cofFromQuotation;
		if (!stash || !stash.quotation_id) {
			frappe.show_alert({ message: "Open a Quotation and use “Create COF” to start.", indicator: "orange" });
			frappe.set_route("cof-list");
			return;
		}
		this.cofSource = stash;

		this.$content.html(frappe.cof_list_page_template.newForm);
		this.initCofWizard();
	}

	initCofWizard() {
		const me = this;
		const src = me.cofSource || {};
		me.cofStep = 1;

		// carried-over data from the quote
		me.cofItems    = (src.items || []).map(it => ({ ...it }));
		me.cofContacts = (src.contact_list || []).map(c => ({
			docname: c.user_name || "", name: c.user_name || "—",
			email: c.email_id || "", phone: c.mobile_no || "", role: c.designation || "",
			poc: Number(c.poc) || 0,
		}));
		me.cofPocIndex = Math.max(0, me.cofContacts.findIndex(c => c.poc === 1));
		me.cofPoFile   = "";   // uploaded PO attachment URL

		// header summary
		me.$content.find("#cofWizQuote").text(src.quotation_id || "—");
		me.$content.find("#cofWizCustomer").text(src.customer_name || src.customer || "—");

		// Step 1 prefill
		me.$content.find("#cofFSubject").val(src.title || src.quotation_id || "");

		me.renderCofContacts();
		me.renderCofAddress();
		me.renderCofItems();
		me.renderCofTaxes();
		me.renderCofTerms();

		// ── nav ──
		me.$content.on("click.cofNew", ".ql-back-btn", () => frappe.set_route("cof-list"));
		me.$content.on("click.cofNew", ".ql-step", (e) => {
			const n = parseInt($(e.currentTarget).data("step"));
			if (n < me.cofStep) me.goCofStep(n);
		});
		me.$content.on("click.cofNew", "[data-wiz-next]", (e) => {
			const n = parseInt($(e.currentTarget).data("wizNext"));
			if (me.validateCofStep(me.cofStep)) me.goCofStep(n);
		});
		me.$content.on("click.cofNew", "[data-wiz-back]", (e) => me.goCofStep(parseInt($(e.currentTarget).data("wizBack"))));

		// PO attachment upload
		me.$content.on("click.cofNew", "#cofPoUploadZone", () => {
			new frappe.ui.FileUploader({
				on_success: (file) => {
					me.cofPoFile = file.file_url || "";
					me.$content.find("#cofPoFileName").text(file.file_name || file.file_url || "Uploaded");
					me.$content.find("#cofPoFileWrap").show();
					frappe.show_alert({ message: "PO attached.", indicator: "green" });
				},
			});
		});
		me.$content.on("click.cofNew", "#cofPoFileRemove", () => {
			me.cofPoFile = "";
			me.$content.find("#cofPoFileWrap").hide();
		});

		// Submit
		me.$content.on("click.cofNew", "#cofSubmitForm", () => me.submitCofWizard());
	}

	goCofStep(n) {
		const me = this;
		me.cofStep = n;
		me.$content.find(".ql-wiz-panel").removeClass("active");
		me.$content.find(`#cofPanel${n}`).addClass("active");
		me.$content.find(".ql-step").each(function() {
			const sn = parseInt($(this).data("step"));
			$(this).removeClass("active done");
			const $c = $(this).find(".ql-step-circle");
			if (sn === n)      { $(this).addClass("active"); $c.html(sn); }
			else if (sn < n)   { $(this).addClass("done");   $c.html('<i class="ti ti-check" style="font-size:13px;"></i>'); }
			else               { $c.html(sn); }
		});
		me.$content.find("#cofProgressFill").css("width", (n / 7 * 100) + "%");
		if (n === 6) me.buildCofPaymentTerms();
		if (n === 7) me.buildCofReview();
		$("#support-page-content").scrollTop(0);
	}

	validateCofStep(n) {
		const me = this;
		if (n === 1 && !me.$content.find("#cofFPoRef").val().trim()) {
			frappe.msgprint("Please enter the PO Ref No.");
			return false;
		}
		return true;
	}

	renderCofContacts() {
		const me = this;
		const $list = me.$content.find("#cofContactsList");
		if (!$list.length) return;
		if (!me.cofContacts.length) {
			$list.html(`<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No contacts carried from the quotation.</div>`);
			return;
		}
		const colors = ["#3b7ef8","#16a34a","#d97706","#7c3aed","#dc2626"];
		$list.html(me.cofContacts.map((c, i) => {
			const isPoc = (i === me.cofPocIndex);
			const clr = colors[i % colors.length];
			return `<div style="background:${isPoc?"rgba(59,126,248,0.05)":"#fff"};border:${isPoc?"2px solid #3b7ef8":"1px solid rgba(0,0,0,0.09)"};border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;">
				<div style="width:38px;height:38px;border-radius:50%;background:${clr}1a;color:${clr};display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:14px;font-weight:700;flex-shrink:0;">${me.escapeAttr((c.name||"?").substring(0,2).toUpperCase())}</div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(c.name)}${isPoc?` <span style="font-size:9px;font-weight:700;color:#3b7ef8;background:rgba(59,126,248,0.12);padding:1px 7px;border-radius:10px;margin-left:4px;">PRIMARY</span>`:""}</div>
					${c.role?`<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${me.escapeAttr(c.role)}</div>`:""}
					${c.email?`<div style="font-size:11px;color:#3b7ef8;margin-top:3px;">${me.escapeAttr(c.email)}</div>`:""}
					${c.phone?`<div style="font-size:11px;color:#374151;">${me.escapeAttr(c.phone)}</div>`:""}
				</div>
			</div>`;
		}).join(""));
	}

	renderCofAddress() {
		const me = this;
		const src = me.cofSource || {};
		const slot = (cardId, name, label, accent, icon) => {
			const $card = me.$content.find(`#${cardId}`);
			if (!$card.length) return;
			if (!name) { $card.html(`<div style="border:1.5px dashed rgba(0,0,0,0.12);border-radius:12px;padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No ${me.escapeAttr(label.toLowerCase())}</div>`); return; }
			$card.html(`<div style="border:1px solid rgba(0,0,0,0.09);border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;">
				<div style="width:38px;height:38px;border-radius:50%;background:${accent}1a;border:2px solid ${accent}33;display:flex;align-items:center;justify-content:center;color:${accent};flex-shrink:0;"><i class="ti ${icon}" style="font-size:16px;"></i></div>
				<div style="flex:1;min-width:0;"><div style="font-family:Syne,sans-serif;font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(name)}</div></div>
			</div>`);
		};
		slot("cofBillingCard",  src.customer_address,      "Billing Address",  "#3b7ef8", "ti-map-pin");
		slot("cofShippingCard", src.shipping_address_name, "Shipping Address", "#16a34a", "ti-truck-delivery");
		slot("cofCompanyCard",  src.company_address,       "Company Address",  "#d97706", "ti-building");
	}

	renderCofItems() {
		const me = this;
		const $wrap = me.$content.find("#cofItemsBody");
		if (!$wrap.length) return;
		const fmtINR = n => Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
		const typeLabel = { new:"New", renewal:"Renewal", additional:"Additional", "add-on":"Add-on", "monthly usage":"Monthly Usage" };
		const typeColor = { new:"#3b7ef8", renewal:"#16a34a", additional:"#d97706", "add-on":"#7c3aed", "monthly usage":"#0891b2" };

		if (!me.cofItems.length) {
			$wrap.html(`<div style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;"><i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>No items carried from the quotation.</div>`);
			me.$content.find("#cofItemsQty").text("0");
			me.$content.find("#cofItemsGrand").text("₹ 0.00");
			return;
		}

		let cards = "";
		me.cofItems.forEach((item, idx) => {
			const qty  = Number(item.qty || 0);
			const rate = Number(item.rate || 0);
			const amt  = qty * rate;
			const rstat = String(item.renewal_status || item.opportunity_type || "new");
			const tkey  = rstat.toLowerCase();
			const renewId = (tkey === "renewal" || tkey === "additional") ? (item.renewal_id || "") : "";
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g,"").trim().length > 0;
			cards += `
<div class="ql-item-card2" data-idx="${idx}">
	<div class="ql-ic-row1">
		<div class="ql-ic-num">${idx+1}</div>
		<div class="ql-ic-item" style="cursor:default;">
			<div class="ql-ic-name">${me.escapeAttr(item.item_name||item.item_code||"—")}</div>
			<div class="ql-ic-sub">
				${item.item_code ? me.escapeAttr(item.item_code) : ""}${item.item_code ? "  ·  " : ""}<span style="color:${typeColor[tkey]||"#3b7ef8"};font-weight:700;">${typeLabel[tkey]||me.escapeAttr(rstat)}</span>${renewId ? `<span class="ql-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(renewId)}</span>` : ""}
			</div>
		</div>
		<div class="ql-ic-field" style="width:64px;">
			<label class="ql-ic-label">Qty</label>
			<input class="ql-cof-qty ql-ic-input" type="number" min="1" step="1" value="${qty}" style="text-align:right;">
		</div>
		<div class="ql-ic-field" style="width:130px;">
			<label class="ql-ic-label">Rate (₹)</label>
			<input class="ql-cof-rate ql-ic-input" type="number" min="0" step="0.01" value="${rate}" style="text-align:right;">
		</div>
		<div class="ql-ic-field" style="width:150px;">
			<label class="ql-ic-label">Amount</label>
			<div class="ql-ic-sa ql-cof-amt" style="white-space:nowrap;text-align:right;">₹${fmtINR(amt)}</div>
		</div>
		<div class="ql-ic-field" style="width:34px;align-items:center;margin-left:auto;">
			<label class="ql-ic-label">Desc</label>
			<button class="ql-cof-desc-btn ${hasDesc?"has-desc":""}" data-idx="${idx}" type="button" title="Edit description"><i class="ti ${hasDesc?"ti-file-check":"ti-file-text"}"></i></button>
		</div>
		<div class="ql-ic-field" style="width:34px;align-items:center;">
			<label class="ql-ic-label">&nbsp;</label>
			<button class="ql-cof-del-btn ql-ic-del" data-idx="${idx}" type="button" title="Remove item"><i class="ti ti-trash"></i></button>
		</div>
	</div>
</div>`;
		});
		$wrap.html(cards);

		me.$content.off("input.cofItem", "#cofItemsBody .ql-cof-qty, #cofItemsBody .ql-cof-rate")
			.on("input.cofItem", "#cofItemsBody .ql-cof-qty, #cofItemsBody .ql-cof-rate", (e) => {
				const $card = $(e.currentTarget).closest(".ql-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.cofItems[idx]) return;
				const q = parseFloat($card.find(".ql-cof-qty").val()) || 0;
				const r = parseFloat($card.find(".ql-cof-rate").val()) || 0;
				me.cofItems[idx].qty = q;
				me.cofItems[idx].rate = r;
				me.cofItems[idx].amount = q * r;
				$card.find(".ql-cof-amt").text("₹" + fmtINR(q * r));
				me.recalcCofTotals();
			});

		me.$content.off("click.cofItem", "#cofItemsBody .ql-cof-desc-btn")
			.on("click.cofItem", "#cofItemsBody .ql-cof-desc-btn", (e) => {
				e.stopPropagation();
				me.openCofDescModal(parseInt($(e.currentTarget).data("idx")));
			});

		me.$content.off("click.cofItem", "#cofItemsBody .ql-cof-del-btn")
			.on("click.cofItem", "#cofItemsBody .ql-cof-del-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				const nm = (me.cofItems[idx] && (me.cofItems[idx].item_name || me.cofItems[idx].item_code)) || `Item ${idx+1}`;
				frappe.confirm(`Remove <b>${frappe.utils.escape_html(nm)}</b>?`, () => { me.cofItems.splice(idx, 1); me.renderCofItems(); });
			});

		me.recalcCofTotals();
	}

	recalcCofTotals() {
		const me = this;
		const fmtINR = n => Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
		let totQty = 0, totAmt = 0;
		(me.cofItems || []).forEach(it => {
			const q = Number(it.qty||0), r = Number(it.rate||0);
			totQty += q; totAmt += q * r;
		});
		me.$content.find("#cofItemsQty").text(totQty.toLocaleString("en-IN"));
		me.$content.find("#cofItemsGrand").text("₹ " + fmtINR(totAmt));
	}

	openCofDescModal(idx) {
		const me = this;
		if (!me.cofItems[idx]) return;
		$("#cofDescModalOverlay").remove();
		const itemName = me.cofItems[idx].item_name || me.cofItems[idx].item_code || `Item ${idx+1}`;
		const $overlay = $(`
		<div id="cofDescModalOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-align-left" style="color:#3b7ef8;"></i> Description</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px;">${me.escapeAttr(itemName)}</div>
					</div>
					<button id="cofDescClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 20px;"><div id="cofDescEditorHost"></div></div>
				<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
					<button id="cofDescCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="cofDescSave" style="padding:7px 18px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		const ctrl = frappe.ui.form.make_control({
			parent: $overlay.find("#cofDescEditorHost").get(0),
			df: { fieldname: "cof_desc", fieldtype: "Text Editor", label: "" },
			render_input: true,
		});
		ctrl.set_value(me.cofItems[idx].description || "");
		const close = () => $overlay.remove();
		$overlay.on("click", "#cofDescClose, #cofDescCancel", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#cofDescSave", () => {
			me.cofItems[idx].description = ctrl.get_value() || "";
			const hasDesc = String(me.cofItems[idx].description).replace(/<[^>]*>/g,"").trim().length > 0;
			const $btn = me.$content.find(`#cofItemsBody .ql-cof-desc-btn[data-idx="${idx}"]`);
			$btn.toggleClass("has-desc", hasDesc);
			$btn.find("i").attr("class", `ti ${hasDesc?"ti-file-check":"ti-file-text"}`);
			close();
		});
	}

	renderCofTaxes() {
		const me = this;
		const src = me.cofSource || {};
		const $box = me.$content.find("#cofTaxesBody");
		if (!$box.length) return;
		const taxes = Array.isArray(src.taxes) ? src.taxes : [];
		me.$content.find("#cofTaxCategory").text(src.tax_category || "—");
		me.$content.find("#cofTaxTemplate").text(src.taxes_and_charges || "—");
		if (!taxes.length) { $box.html(`<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No taxes carried from the quotation.</div>`); return; }
		$box.html(`<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;margin-top:8px;">
			<table style="width:100%;border-collapse:collapse;">
				<thead><tr style="background:#f8fafc;"><th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Type</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Account Head</th><th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Rate</th></tr></thead>
				<tbody>${taxes.map(t => `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);"><td style="padding:9px 10px;font-size:12px;color:#111827;">${me.escapeAttr(t.charge_type||"—")}</td><td style="padding:9px 10px;font-size:12px;color:#374151;">${me.escapeAttr(t.account_head||t.description||"—")}</td><td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">${Number(t.rate||0)}</td></tr>`).join("")}</tbody>
			</table></div>`);
	}

	renderCofTerms() {
		const me = this;
		const src = me.cofSource || {};
		me.$content.find("#cofPayTermsName").text(src.payment_terms_template || "Custom schedule from quotation");
		me.$content.find("#cofTcName").text(src.tc_name || "—");
		const $terms = me.$content.find("#cofTermsContent");
		if (src.terms) $terms.html(src.terms).show(); else $terms.hide();
	}

	buildCofReview() {
		const me = this;
		const src = me.cofSource || {};
		const poRef = me.$content.find("#cofFPoRef").val().trim();
		const priority = me.$content.find("#cofFPriority").val();
		me.$content.find("#cofRevQuote").text(src.quotation_id || "—");
		me.$content.find("#cofRevCustomer").text(src.customer_name || src.customer || "—");
		me.$content.find("#cofRevSubject").text(me.$content.find("#cofFSubject").val().trim() || "—");
		me.$content.find("#cofRevPoRef").text(poRef || "—");
		me.$content.find("#cofRevPriority").text(priority || "—");
		me.$content.find("#cofRevPoFile").text(me.cofPoFile ? "Attached" : "Not attached");
		me.$content.find("#cofRevItems").text(me.cofItems.length);
		me.$content.find("#cofRevContacts").text(me.cofContacts.length);
	}

	buildCofPaymentTerms() {
		const me = this;
		me.renderCofReviewPaymentSchedule();
		me.renderCofReviewMarginTable();
	}

	getCofItemMarginValue(item, keys) {
		if (!item) return 0;
		for (const key of keys) {
			if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
			const v = Number(item[key]);
			if (Number.isFinite(v)) return v;
		}
		return 0;
	}

	renderCofReviewPaymentSchedule() {
		const me = this;
		const src = me.cofSource || {};
		const $box = me.$content.find("#cofRevPaymentSchedule");
		if (!$box.length) return;
		const schedule = Array.isArray(src.payment_schedule) ? src.payment_schedule : [];
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		if (!schedule.length) {
			$box.html(`<div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Payment Schedule</div>
				<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No payment schedule carried from the quotation.</div>`);
			return;
		}

		$box.html(`
			<div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Payment Schedule <span style="font-size:10px;font-weight:500;color:#9ca3af;">(read-only, from quotation)</span></div>
			<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
				<table style="width:100%;border-collapse:collapse;">
					<thead><tr style="background:#f8fafc;">
						<th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">#</th>
						<th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Description</th>
						<th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Due Date</th>
						<th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Invoice %</th>
						<th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Amount</th>
					</tr></thead>
					<tbody>
						${schedule.map((p, i) => `
							<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
								<td style="padding:9px 10px;font-size:12px;color:#111827;">${i + 1}</td>
								<td style="padding:9px 10px;font-size:12px;color:#374151;">${me.escapeAttr(p.description || p.payment_term || "—")}</td>
								<td style="padding:9px 10px;font-size:12px;color:#374151;">${me.escapeAttr(p.due_date || "—")}</td>
								<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">${Number(p.invoice_portion || 0)}%</td>
								<td style="padding:9px 10px;font-size:12px;text-align:right;color:#111827;">₹${fmtINR(p.payment_amount)}</td>
							</tr>`).join("")}
					</tbody>
				</table>
			</div>
		`);
	}

	renderCofReviewMarginTable() {
		const me = this;
		const $box = me.$content.find("#cofRevMarginTable");
		if (!$box.length) return;
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const items = me.cofItems || [];

		if (!items.length) {
			$box.html(`<div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Margin Summary</div>
				<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No items to summarize.</div>`);
			return;
		}

		let totSell = 0, totBuy = 0, totOrc = 0, totProfit = 0;
		const rows = items.map((item, idx) => {
			const qty = Number(item.qty || 0);
			const rate = Number(item.rate || 0);
			const sellAmt = qty * rate;
			const buyRate = me.getCofItemMarginValue(item, ["buying_rate", "cost_rate", "buying_price", "purchase_rate"]);
			const buyAmt = me.getCofItemMarginValue(item, ["buying_amount", "buying_amt", "cost_amount", "purchase_amount", "total_cost"]) || (buyRate * qty);
			const orcAmt = me.getCofItemMarginValue(item, ["orc_amount", "custom_orc_amount", "total_orc_amount"]);
			const profit = me.getCofItemMarginValue(item, ["margin_amount", "gross_profit"]) || Math.max(0, sellAmt - buyAmt);

			totSell += sellAmt; totBuy += buyAmt; totOrc += orcAmt; totProfit += profit;

			return `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
				<td style="padding:9px 10px;font-size:12px;color:#111827;">${idx + 1}</td>
				<td style="padding:9px 10px;font-size:12px;color:#374151;">${me.escapeAttr(item.item_name || item.item_code || "—")}</td>
				<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">₹${fmtINR(sellAmt)}</td>
				<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">₹${fmtINR(buyAmt)}</td>
				<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">₹${fmtINR(orcAmt)}</td>
				<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:600;color:#16a34a;">₹${fmtINR(profit)}</td>
			</tr>`;
		}).join("");

		$box.html(`
			<div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">Margin Summary <span style="font-size:10px;font-weight:500;color:#9ca3af;">(read-only)</span></div>
			<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
				<table style="width:100%;border-collapse:collapse;">
					<thead><tr style="background:#f8fafc;">
						<th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">#</th>
						<th style="padding:9px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Item</th>
						<th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Selling Amt</th>
						<th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Buying Amt</th>
						<th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">ORC Amt</th>
						<th style="padding:9px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid rgba(0,0,0,0.08);">Profit</th>
					</tr></thead>
					<tbody>${rows}</tbody>
					<tfoot><tr style="background:#f8fafc;">
						<td colspan="2" style="padding:9px 10px;font-size:12px;font-weight:700;color:#111827;">Total</td>
						<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#111827;">₹${fmtINR(totSell)}</td>
						<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#111827;">₹${fmtINR(totBuy)}</td>
						<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#111827;">₹${fmtINR(totOrc)}</td>
						<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#16a34a;">₹${fmtINR(totProfit)}</td>
					</tr></tfoot>
				</table>
			</div>
		`);
	}

	submitCofWizard() {
		const me  = this;
		const src = me.cofSource || {};

		// validate PO Ref (also enforced on step 1)
		const poRef = me.$content.find("#cofFPoRef").val().trim();
		if (!poRef) { frappe.msgprint("Please enter the PO Ref No."); me.goCofStep(1); return; }

		const subject  = me.$content.find("#cofFSubject").val().trim() || src.title || src.quotation_id || "";
		const priority = me.$content.find("#cofFPriority").val() || "";

		// contacts → contact_list rows (user_name = Contact docname, poc flag)
		const pocIdx = Number.isFinite(me.cofPocIndex) ? me.cofPocIndex : 0;
		const contactList = (me.cofContacts || []).map((c, i) => ({
			user_name:   c.docname || "",
			email_id:    c.email   || "",
			mobile_no:   c.phone   || "",
			designation: c.role    || "",
			poc:         (i === pocIdx) ? 1 : 0,
		}));
		const primaryContact = (me.cofContacts || [])[pocIdx] || null;

		// items → Customer Order Form Item rows (all mandatory fields covered)
		const items = (me.cofItems || []).map(it => {
			const qty  = Number(it.qty  || 0);
			const rate = Number(it.rate || 0);
			const amt  = Number(it.amount || qty * rate);
			return {
				item_code:        it.item_code || "",
				item_name:        it.item_name || it.item_code || "",
				description:      it.description || it.item_name || it.item_code || "",  // reqd
				qty:              qty,
				uom:              it.uom || "Nos",                                       // reqd
				conversion_factor: 1,                                                    // reqd
				rate:             rate,
				price_list_rate:  rate,
				amount:           amt,
				base_rate:        rate,
				base_amount:      amt,
				item_group:       it.item_group || it.group || undefined,
				brand:            (it.brand && it.brand !== "—") ? it.brand : undefined,
				orc:              it.orc ? 1 : 0,
			};
		});

		// taxes carried from the quote
		const taxRows = (Array.isArray(src.taxes) ? src.taxes : []).map(t => ({
			charge_type:  t.charge_type,
			account_head: t.account_head,
			description:  t.description,
			rate:         t.rate,
			cost_center:  t.cost_center,
			included_in_print_rate: t.included_in_print_rate,
		}));

		// payment schedule carried from the quote (already-built rows)
		const paymentSchedule = (Array.isArray(src.payment_schedule) ? src.payment_schedule : []).map(p => ({
			description:     p.description || p.payment_term || "",
			due_date:        p.due_date,
			invoice_portion: p.invoice_portion,
			payment_amount:  p.payment_amount,
		}));

		const doc = {
			doctype:                "Customer Order Form",
			naming_series:          "COF-.YYYY.-.####",
			currency:               "INR",
			selling_price_list:     "Standard Selling",

			customer:               src.customer || "",
			customer_name:          src.customer_name || "",
			company_name:           src.company || "",
			quotation_id:           src.quotation_id || "",
			subject:                subject,
			title:                  subject,
			status:                 "Draft",

			// PO details (entered in wizard)
			po_ref_number:          poRef,
			customers_purchase_order: poRef,
			custom_po_attachment:   me.cofPoFile || "",
			priority:               priority,

			// addresses
			customer_address:       src.customer_address || "",
			shipping_address_name:  src.shipping_address_name || "",
			company_address:        src.company_address || "",

			// contacts
			contact_person:         primaryContact?.docname || src.contact_person || "",
			contact_email:          primaryContact?.email   || src.contact_email  || "",
			contact_list:           contactList,

			// sales team
			sales_team:             Array.isArray(src.sales_team) ? src.sales_team : [],

			// taxes / terms
			tax_category:           src.tax_category || "",
			taxes_and_charges:      src.taxes_and_charges || "",
			taxes:                  taxRows,
			tc_name:                src.tc_name || "",
			terms:                  src.terms || "",
			payment_terms_template: src.payment_terms_template || "",
			payment_schedule:       paymentSchedule,

			items:                  items,
		};

		const $btn = me.$content.find("#cofSubmitForm");
		$btn.prop("disabled", true).html('<i class="ti ti-loader"></i> Creating…');

		frappe.call({
			method: "frappe.client.insert",
			args: { doc },
			callback: (r) => {
				if (r.message) {
					me.hasFetched = false;   // force list refetch
					frappe._cofFromQuotation = null;   // clear the stash
					frappe.show_alert({ message: `COF ${r.message.name} created!`, indicator: "green" });
					frappe.set_route("cof-list", r.message.name);
				} else {
					$btn.prop("disabled", false).html('<i class="ti ti-check"></i> Create COF');
				}
			},
			error: () => {
				$btn.prop("disabled", false).html('<i class="ti ti-check"></i> Create COF');
				frappe.show_alert({ message: "Failed to create COF.", indicator: "red" });
			},
		});
	}

	fetchRecords() {
		if (this.hasFetched) return Promise.resolve();

		const callGetList = (limitStart, limitPageLength) => {
			return new Promise((resolve, reject) => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Customer Order Form",
						fields: ["name", "subject", "status", "customer", "owner", "grand_total", "creation"],
						limit_start: limitStart,
						limit_page_length: limitPageLength,
						order_by: "modified desc",
					},
					callback: (response) => {
						resolve((response && response.message) || []);
					},
					error: reject,
				});
			});
		};

		const pageLength = 500;
		let start = 0;
		let allRows = [];

		const fetchNextPage = () => {
			return callGetList(start, pageLength)
				.then((rows) => {
					allRows = allRows.concat(rows);
					if (rows.length < pageLength) return;
					start += pageLength;
					return fetchNextPage();
				});
		};

		return fetchNextPage()
			.then(() => {
				this.records = allRows.map((doc) => ({
					id: doc.name,
					subject: doc.subject || doc.name,
					party: doc.customer || "-",
					status: doc.status || "Draft",
					amount: Number(doc.grand_total || 0),
					owner: doc.owner || "-",
					assigned_to: this.formatAge(doc.creation),
				}));
				this.hasFetched = true;
			})
			.catch(() => {
				this.records = [];
			});
	}

	fetchDetailRecord(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Customer Order Form",
					name: recordId,
				},
				callback: (response) => {
					this.detailRecord = (response && response.message) || null;
					resolve(this.detailRecord);
				},
				error: () => {
					this.detailRecord = null;
					resolve(null);
				},
			});
		});
	}

	fetchDetailActivities(recordId) {
		return new Promise((resolve) => {
			// Try to fetch from Comment doctype (standard Frappe way to store comments on documents)
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Comment",
					fields: ["name", "content", "comment_type", "owner", "creation"],
					filters: { reference_doctype: "Customer Order Form", reference_name: recordId },
					limit_page_length: 500,
					order_by: "creation desc",
				},
				callback: (response) => {
					const comments = (response && response.message) || [];
					this.detailActivities = comments.map((comment) => {
						const type = comment.comment_type === "Comment" ? "Comment" : "Note";
						return {
							id: comment.name,
							title: comment.content || "",
							description: comment.content || "",
							type: type,
							tab: this.mapActivityTypeToTab(type),
							owner: comment.owner || frappe.session.user,
							created: this.formatActivityTime(comment.creation),
							status: "completed",
						};
					});
					resolve(this.detailActivities);
				},
				error: () => {
					console.warn("Could not fetch comments for record. Make sure the document has comments enabled.");
					this.detailActivities = [];
					resolve([]);
				},
			});
		});
	}

	fetchDetailAttachments(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "File",
					fields: ["name", "file_name", "file_url", "creation", "owner"],
					filters: { attached_to_doctype: "Customer Order Form", attached_to_name: recordId },
					limit_page_length: 500,
					order_by: "creation desc",
				},
				callback: (response) => {
					const files = (response && response.message) || [];
					this.detailAttachments = files.map((file) => ({
						id: file.name,
						name: file.file_name || "",
						url: file.file_url || "",
						owner: file.owner || "",
						created: this.formatActivityTime(file.creation),
					}));
					resolve(this.detailAttachments);
				},
				error: () => {
					this.detailAttachments = [];
					resolve([]);
				},
			});
		});
	}

	mapActivityTypeToTab(type) {
		const map = {
			Note: "notes",
			Call: "calls",
			Appointment: "appointments",
			Comment: "comments",
		};
		return map[type] || "notes";
	}

	formatActivityTime(timestamp) {
		if (!timestamp) return "Just now";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(timestamp) : new Date(timestamp);
			if (!created) return "Just now";
			const diffMs = Date.now() - created.getTime();
			const seconds = Math.floor(diffMs / 1000);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			
			if (seconds < 60) return "Just now";
			if (minutes < 60) return `${minutes}m ago`;
			if (hours < 24) return `${hours}h ago`;
			if (days < 7) return `${days}d ago`;
			
			const date = created.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
			return date;
		} catch (e) {
			return "Just now";
		}
	}

	renderListView() {
		this.view = "list";
		this.page.set_title("Customer Order Forms");
		document.title = "Customer Order Forms";

		const customerOptions = Array.from(new Set(this.records.map((row) => String(row.party || "").trim()).filter((name) => name && name !== "-"))).sort();
		const ownerOptions = this.ownerOptions.length
			? this.ownerOptions
			: Array.from(new Set(this.records.map((row) => String(row.owner || "").trim()).filter(Boolean))).sort().map((owner) => ({ value: owner, label: owner }));
		const rows = this.getFilteredRows();
		const visibleRows = rows.slice(0, this.pageSize);
		const visibleCount = visibleRows.length;
			const appliedCount = (this.saved_filters || []).length;
		const amountSortIcon = this.amountSortDir === "asc" ? "ti-sort-ascending" : this.amountSortDir === "desc" ? "ti-sort-descending" : "ti-arrows-sort";
		const amountSortClass = this.amountSortDir ? "cof-sort-active" : "";
		const statusOptions = ["", ...Array.from(new Set(this.records.map((row) => row.status).filter(Boolean)))];
		const tableRows = visibleRows
			.map((row) => {
				const customerName = row.party || "-";
				const safeCustomerName = this.escapeAttr(customerName);
				return `
					<tr class="cof-list-row" data-name="${row.id}">
						<td class="cof-id">${row.id}</td>
						<td>${row.subject}</td>
						<td class="cof-col-customer"><span class="cof-customer-text" title="${safeCustomerName}">${safeCustomerName}</span></td>
						<td><span class="cof-status ${this.getStatusClass(row.status)}">${row.status}</span></td>
						<td class="cof-amt">${this.formatCurrency(row.amount)}</td>
						<td>${row.owner}</td>
						<td>${row.assigned_to}</td>
					</tr>
				`;
			})
			.join("");

		this.$content.html(`
			<div class="cof-list-view">
				<div class="card cof-list-card">
					<div class="cof-list-toolbar">
						${this.renderMultiFilter("customer", customerOptions.map((customer) => ({ value: customer, label: customer })), this.selectedCustomers, "Customer")}
						${this.renderMultiFilter("owner", ownerOptions, this.selectedOwners, "Owner")}
						<select id="cofStatusFilter" class="cof-input cof-select">
							${statusOptions
								.map((status) => {
									const label = status || "Status";
									const selected = this.statusFilter === status ? "selected" : "";
									return `<option value="${status}" ${selected}>${label}</option>`;
								})
								.join("")}
						</select>
						<div class="cof-list-toolbar-right">
							<div class="cof-filter-wrap">
								<button id="cofOpenFilters" class="btn cof-filter-trigger" type="button" style="white-space: nowrap; padding: 0; overflow: hidden;">
									<span class="cof-filter-btn-label" style="display:inline-flex; align-items:center; gap:6px; padding: 7px 12px;"><i class="ti ti-filter"></i> Filters${appliedCount ? ` (${appliedCount})` : ""}</span>
									<span class="cof-filter-btn-close" style="display:none; align-items:center; justify-content:center; min-width:28px; padding: 7px 10px; border-left:1px solid rgba(15,23,42,0.12); cursor:pointer;">x</span>
								</button>
							</div>
							<button id="cofClearFilters" class="btn" type="button"><i class="ti ti-filter-off"></i> Clear</button>
							<button id="cofNewDoc" class="btn btn-primary" type="button"><i class="ti ti-plus"></i> New Customer Order Form</button>
						</div>
					</div>
					<div class="table-wrap cof-list-table-wrap">
						<table class="cof-list-table">
							<thead>
								<tr>
									<th>ID</th>
									<th>Subject</th>
									<th class="cof-col-customer">Customer</th>
									<th>Status</th>
									<th id="cofSortAmount" class="cof-sortable ${amountSortClass}">Amount <i class="ti ${amountSortIcon}"></i></th>
									<th>Owner</th>
									<th>Assigned To</th>
								</tr>
							</thead>
							<tbody>${tableRows || '<tr><td colspan="7" class="cof-empty">No records found</td></tr>'}</tbody>
						</table>
					</div>
					<div class="cof-list-footer">
						<div class="page-size-btns">
							<button class="ps-btn ${this.pageSize === 20 ? "active" : ""}" data-size="20" type="button">20</button>
							<button class="ps-btn ${this.pageSize === 100 ? "active" : ""}" data-size="100" type="button">100</button>
							<button class="ps-btn ${this.pageSize === 500 ? "active" : ""}" data-size="500" type="button">500</button>
							<button class="ps-btn ${this.pageSize === 2500 ? "active" : ""}" data-size="2500" type="button">2500</button>
						</div>
						<div class="record-count">${visibleCount} of ${rows.length}</div>
						<button id="cofLoadMore" class="load-more-btn" type="button" ${visibleCount >= rows.length ? "disabled" : ""}>Load More</button>
					</div>
				</div>
			</div>
		`);

		this.bindListActions();
	}

	renderMultiFilter(key, options, selectedValues, placeholder) {
		const selectedSet = new Set(selectedValues || []);
		const selectedCount = selectedSet.size;
		const triggerText = selectedCount ? `${placeholder} (${selectedCount})` : placeholder;
		const sortedOptions = [...(options || [])].sort((a, b) => {
			const aValue = String(a?.value || "").trim();
			const bValue = String(b?.value || "").trim();
			const aSelected = selectedSet.has(aValue) ? 0 : 1;
			const bSelected = selectedSet.has(bValue) ? 0 : 1;
			if (aSelected !== bSelected) return aSelected - bSelected;
			return String(a?.label || aValue).localeCompare(String(b?.label || bValue));
		});

		return `
			<div class="cof-multi-wrap">
				<div class="cof-multi" data-filter="${key}">
					<button type="button" class="cof-multi-trigger" data-filter-trigger="${key}">
						<span>${this.escapeAttr(triggerText)}</span>
						<i class="ti ti-chevron-down"></i>
					</button>
					<div class="cof-multi-menu" data-filter-menu="${key}">
						<div class="cof-multi-search-wrap">
							<input type="text" class="cof-multi-search" data-filter-search="${key}" placeholder="Search ${placeholder.toLowerCase()}..." />
						</div>
						<div class="cof-multi-options">
							${sortedOptions
								.map((option) => {
									const value = String(option.value || "").trim();
									const label = String(option.label || value).trim();
									if (!value) return "";
									const checked = selectedSet.has(value) ? "checked" : "";
									return `
										<label class="cof-multi-option" data-filter-option="${key}" data-label="${this.escapeAttr(label.toLowerCase())}">
											<input type="checkbox" class="cof-multi-checkbox" data-filter-check="${key}" value="${this.escapeAttr(value)}" ${checked}>
											<span>${this.escapeAttr(label)}</span>
										</label>
									`;
								})
								.join("")}
						</div>
					</div>
				</div>
			</div>
		`;
	}

	closeStandardFilterPopover(button) {
		const candidates = [];
		if (button) candidates.push($(button));
		if (this.activeFilterPopoverButton && this.activeFilterPopoverButton.length) candidates.push(this.activeFilterPopoverButton);
		candidates.push(this.$content ? this.$content.find("#cofOpenFilters") : $("#cofOpenFilters"));

		candidates.forEach(($btn) => {
			if (!$btn || !$btn.length) return;
			const instance = $btn.data("bs.popover");
			if (instance) {
				try {
					$btn.popover("hide");
				} catch (e) {}
				try {
					$btn.popover("dispose");
				} catch (e) {}
			}
			$btn.find(".cof-filter-btn-close").css("display", "none");
		});

		// Force-remove any stale popover DOM that might survive bootstrap lifecycle edge-cases.
		$("body > .popover.filter-popover").remove();
		$("body > .popover.show").remove();
		this.activeFilterPopoverButton = null;
		$(document).off("mousedown.cofStandardFilter");
	}

	openStandardFilterPopover(button) {
		const me = this;
		const DOCTYPE = this.filterDoctype || "Customer Order Form";
		const $btn = $(button);

		if (this.activeFilterPopoverButton && this.activeFilterPopoverButton.length && this.activeFilterPopoverButton[0] !== $btn[0]) {
			this.closeStandardFilterPopover(this.activeFilterPopoverButton);
		}

		const setFilterButtonState = (isOpen) => {
			const $close = $btn.find(".cof-filter-btn-close");
			if (!$close.length) return;
			$close.css("display", isOpen ? "inline-flex" : "none");
		};
		const safeClosePopover = () => {
			me.closeStandardFilterPopover($btn);
			setFilterButtonState(false);
		};

		if ($btn.data("bs.popover")) {
			safeClosePopover();
			return;
		}

		frappe.model.with_doctype(DOCTYPE, () => {
			if (!$btn.length || !$btn[0] || !document.body.contains($btn[0])) {
				return;
			}

			let popover_content = $('<div class="filter-area">');

			let FG = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: DOCTYPE,
				on_change: function () {},
			});

			FG.update_filter_button = function () {};

			setTimeout(() => {
				if ((me.saved_filters || []).length) FG.add_filters(me.saved_filters);
				else FG.add_filter(DOCTYPE, "name", "=", "", false);
			}, 0);

			const footer = $(`
				<div class="filter-action-buttons cof-std-filter-footer mt-1 d-flex justify-content-between align-items-center">
					<button type="button" class="text-muted add-filter btn btn-xs cof-std-btn cof-std-btn-add">+ Add a Filter</button>
					<div class="filter-action-right">
						<button type="button" class="btn btn-secondary btn-xs clear-filters mr-2 cof-std-btn cof-std-btn-clear">Clear</button>
						<button type="button" class="btn btn-primary btn-xs apply-filters cof-std-btn cof-std-btn-apply">Apply</button>
					</div>
				</div>
			`);

			popover_content.find(".filter-action-buttons").remove();
			popover_content.append(footer);

			footer.css({
				marginTop: "2px",
				paddingTop: "3px",
				borderTop: "none",
				gap: "4px",
			});
			footer.find(".filter-action-right").css({
				display: "inline-flex",
				alignItems: "center",
				gap: "8px",
			});
			footer.find(".cof-std-btn").css({
				height: "26px",
				padding: "0 9px",
				borderRadius: "8px",
				fontSize: "11px",
				fontWeight: "600",
				boxShadow: "none",
			});
			footer.find(".cof-std-btn-add").css({
				background: "#f8fafc",
				color: "#334155",
				border: "1px solid rgba(15,23,42,0.14)",
			});
			footer.find(".cof-std-btn-clear").css({
				background: "#ffffff",
				color: "#0f172a",
				border: "1px solid rgba(15,23,42,0.2)",
				marginRight: "0",
			});
			footer.find(".cof-std-btn-apply").css({
				background: "#2f6fe5",
				color: "#ffffff",
				border: "1px solid #2f6fe5",
			});

			footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));

			footer.find(".clear-filters").on("click", () => {
				FG.clear_filters();
				me.saved_filters = [];
				me.pageSize = 20;
				safeClosePopover();
				me.renderListView();
			});

			footer.find(".apply-filters").on("click", () => {
				me.saved_filters = FG.get_filters() || [];
				me.pageSize = 20;
				safeClosePopover();
				me.renderListView();
			});

			try {
				$btn.popover({
					html: true,
					placement: "bottom",
					content: popover_content[0],
					trigger: "manual",
					container: document.body,
				});
				if (!$btn.length || !$btn[0] || !document.body.contains($btn[0])) {
					safeClosePopover();
					return;
				}
				$btn.popover("show");
				this.activeFilterPopoverButton = $btn;
				setFilterButtonState(true);
				const tipInstance = $btn.data("bs.popover");
				const tipElement = tipInstance && typeof tipInstance.getTipElement === "function" ? tipInstance.getTipElement() : null;
				if (tipElement) {
					$(tipElement).addClass("filter-popover");
					const popoverWidth = Math.min(920, Math.max(620, window.innerWidth - 24));
					$(tipElement).css({
						maxWidth: `${popoverWidth}px`,
						width: `${popoverWidth}px`,
					});
					$(tipElement).find(".popover-body").css({
						padding: "6px 8px",
						maxHeight: "260px",
						overflowY: "auto",
						overflowX: "hidden",
					});
					$(tipElement).find(".filter-area").css({ lineHeight: "1.15", width: "100%" });
					$(tipElement).find(".filter-group .form-control, .filter-group input, .filter-group select").css({
						height: "26px",
						minHeight: "26px",
						paddingTop: "2px",
						paddingBottom: "2px",
						fontSize: "11px",
					});
					$(tipElement).find(".filter-group .filter-row, .filter-group .filter-field").css({ marginBottom: "2px" });
					$(tipElement).find(".filter-group .text-muted, .filter-group small").css({
						fontSize: "10px",
						lineHeight: "1.1",
						marginTop: "0",
						marginBottom: "0",
						whiteSpace: "nowrap",
						display: "none",
					});
					$(tipElement).find(".filter-group .filter-empty").css({ margin: "2px 0 4px" });
					$(tipElement).find("hr, .filter-group hr, .filter-group .divider, .filter-group .filter-divider").css({ display: "none" });
				}
			} catch (err) {
				console.error("Failed to open standard filter popover", err);
				safeClosePopover();
				return;
			}

			$(document)
				.off("mousedown.cofStandardFilter")
				.on("mousedown.cofStandardFilter", (event) => {
					if (!$(event.target).closest(".filter-popover, #cofOpenFilters").length) {
						safeClosePopover();
					}
				});
		});
	}

	renderDetailView() {
		this.view = "detail";
		
		if (!this.selectedRecord) {
			this.$content.html('<div style="padding:20px;text-align:center;">Record not found</div>');
			return;
		}

		if (this.isLoadingDetail) return;
		this.isLoadingDetail = true;

		this.$content.empty().html(
			'<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading record details...</p></div>'
		);

		Promise.all([
			this.fetchDetailRecord(this.selectedRecord.id),
			this.fetchDetailActivities(this.selectedRecord.id),
			this.fetchDetailAttachments(this.selectedRecord.id),
		])
			.then(() => {
				this.$content.empty().append($(frappe.render_template("cof_list", {})));
				this.injectSelectedRecordInDetail();
				this.injectDetailActivities();
				this.injectDetailAttachments();
				this.setPageTitle();
				this.bindActivityFilters();
				this.bindEnhancedActions();
				this.renderWorkflow();
			})
			.finally(() => {
				this.isLoadingDetail = false;
			});
	}

	injectDetailActivities() {
		const $activityList = this.$content.find("#activityList");
		if (!$activityList.length) return;

		$activityList.empty();

		if (!this.detailActivities.length) {
			$activityList.html('<div style="padding:20px;text-align:center;color:#9ca3af;">No activities yet</div>');
			return;
		}

		this.detailActivities.forEach((activity) => {
			const $item = $(`
				<div class="act-item" data-tab="${activity.tab}" data-status="${activity.status}">
					<div class="act-icon note"><i class="ti ti-${this.getActivityIcon(activity.type)}"></i></div>
					<div class="act-body">
						<div class="act-title">${this.escapeAttr(activity.title)}</div>
						<div class="act-meta">${this.escapeAttr(activity.owner)} · ${activity.created}</div>
					</div>
					<span class="act-type">${activity.type}</span>
				</div>
			`);
			$activityList.append($item);
		});

		this.applyFilter();
	}

	injectDetailAttachments() {
		const $attachPanel = this.$content.find("#attachmentsPanel");
		if (!$attachPanel.length) return;

		$attachPanel.empty();

		if (!this.detailAttachments.length) {
			$attachPanel.html('<div style="padding:20px;text-align:center;color:#9ca3af;">No attachments yet</div>');
			return;
		}

		const attachmentsList = this.detailAttachments.map((file) => `
			<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid rgba(15,23,42,0.08);">
				<i class="ti ti-file" style="font-size:18px;color:#64748b;"></i>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;font-weight:500;color:#0f172a;word-break:break-word;"><a href="${this.escapeAttr(file.url)}" target="_blank">${this.escapeAttr(file.name)}</a></div>
					<div style="font-size:12px;color:#9ca3af;margin-top:2px;">${this.escapeAttr(file.owner)} · ${file.created}</div>
				</div>
			</div>
		`).join("");

		$attachPanel.html(attachmentsList);
	}

	getActivityIcon(type) {
		const map = {
			Note: "notes",
			Call: "phone",
			Appointment: "calendar-event",
			Comment: "message-circle",
		};
		return map[type] || "notes";
	}

	bindListActions() {
		this.$content
			.off("click.cofList", "[data-filter-trigger]")
			.on("click.cofList", "[data-filter-trigger]", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const key = String($(event.currentTarget).data("filterTrigger") || "");
				const $currentMenu = this.$content.find(`[data-filter-menu='${key}']`);
				const willOpen = !$currentMenu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (willOpen) $currentMenu.addClass("open");
			});

		this.$content
			.off("change.cofList", ".cof-multi-checkbox")
			.on("change.cofList", ".cof-multi-checkbox", (event) => {
				const key = String($(event.currentTarget).data("filterCheck") || "");
				const values = this.$content
					.find(`.cof-multi-checkbox[data-filter-check='${key}']:checked`)
					.map((_, el) => String(el.value || "").trim())
					.get()
					.filter(Boolean);

				if (key === "customer") this.selectedCustomers = values;
				if (key === "owner") this.selectedOwners = values;
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content
			.off("input.cofList", ".cof-multi-search")
			.on("input.cofList", ".cof-multi-search", (event) => {
				const key = String($(event.currentTarget).data("filterSearch") || "");
				const query = String($(event.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => {
					const label = String($(item).data("label") || "").toLowerCase();
					$(item).toggle(!query || label.includes(query));
				});
			});

		this.$content
			.off("click.cofList", "#cofOpenFilters .cof-filter-btn-close")
			.on("click.cofList", "#cofOpenFilters .cof-filter-btn-close", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.closeStandardFilterPopover(this.$content.find("#cofOpenFilters"));
			});

		this.$content
			.off("click.cofList", "#cofOpenFilters")
			.on("click.cofList", "#cofOpenFilters", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if ($(event.target).closest(".cof-filter-btn-close").length) {
					this.closeStandardFilterPopover(event.currentTarget);
					return;
				}
				this.openStandardFilterPopover(event.currentTarget);
			});

		this.$content
			.off("change.cofList", "#cofStatusFilter")
			.on("change.cofList", "#cofStatusFilter", (event) => {
				this.statusFilter = String($(event.currentTarget).val() || "").trim();
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofClearFilters")
			.on("click.cofList", "#cofClearFilters", () => {
				this.selectedCustomers = [];
				this.selectedOwners = [];
				this.statusFilter = "";
				this.saved_filters = [];
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofSortAmount")
			.on("click.cofList", "#cofSortAmount", (event) => {
				event.preventDefault();
				if (!this.amountSortDir) {
					this.amountSortDir = "asc";
				} else if (this.amountSortDir === "asc") {
					this.amountSortDir = "desc";
				} else {
					this.amountSortDir = "";
				}
				this.renderListView();
			});

		this.$content
			.off("click.cofList", ".ps-btn")
			.on("click.cofList", ".ps-btn", (event) => {
				const size = Number($(event.currentTarget).data("size") || 20);
				if (!Number.isFinite(size) || size <= 0) return;
				this.pageSize = size;
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofLoadMore")
			.on("click.cofList", "#cofLoadMore", () => {
				this.pageSize += this.pageStep;
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofNewDoc")
			.on("click.cofList", "#cofNewDoc", () => {
				frappe.set_route("cof-list", "new");
			});

		this.$content
			.off("click.cofList", ".cof-list-row")
			.on("click.cofList", ".cof-list-row", (event) => {
				const name = String($(event.currentTarget).data("name") || "");
				const selected = this.records.find((row) => row.id === name);
				if (!selected) return;
				this.selectedRecord = selected;
				this.currentStage = 0;
				frappe.set_route("cof-list", name);
			});

		$(document)
			.off("click.cofListFilters")
			.on("click.cofListFilters", (event) => {
				if (!$(event.target).closest(".cof-multi").length) {
					this.$content.find("[data-filter-menu]").removeClass("open");
				}
			});
	}

	applyUrlFilters() {
		const urlParams = new URLSearchParams(window.location.search);
		const filters_encoded = urlParams.get("filters") || "";
		if (filters_encoded) {
			try {
				const parsed = JSON.parse(filters_encoded);
				this.saved_filters = Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				try {
					const decoded = decodeURIComponent(filters_encoded);
					const parsed = JSON.parse(decoded);
					this.saved_filters = Array.isArray(parsed) ? parsed : [];
				} catch (err) {
					console.warn("Failed to parse adv filters:", err);
				}
			}
		}
	}

	getFilteredRows() {
		const selectedCustomers = new Set(this.selectedCustomers);
		const selectedOwners = new Set(this.selectedOwners);
		const filtered = this.records.filter((row) => {
			if (this.statusFilter && row.status !== this.statusFilter) return false;
			if (selectedCustomers.size && !selectedCustomers.has(String(row.party || ""))) return false;
			if (selectedOwners.size && !selectedOwners.has(String(row.owner || ""))) return false;
			if ((this.saved_filters || []).length) {
				const matchesAll = this.saved_filters.every((rawFilter) => this.matchStandardFilter(row, rawFilter));
				if (!matchesAll) return false;
			}
			return true;
		});

		if (!this.amountSortDir) return filtered;

		return filtered.sort((a, b) => {
			const amountA = Number(a.amount || 0);
			const amountB = Number(b.amount || 0);
			if (this.amountSortDir === "asc") return amountA - amountB;
			return amountB - amountA;
		});
	}

	getFilterFieldValue(row, field) {
		if (field === "name" || field === "id") return row.id;
		if (field === "subject") return row.subject;
		if (field === "customer") return row.party;
		if (field === "status") return row.status;
		if (field === "owner") return row.owner;
		if (field === "grand_total" || field === "amount") return row.amount;
		if (field === "creation") return row.creation;
		return "";
	}

	normalizeStandardFilter(rawFilter) {
		if (Array.isArray(rawFilter)) {
			if (rawFilter.length >= 4) {
				return {
					field: String(rawFilter[1] || "").trim(),
					op: String(rawFilter[2] || "=").trim().toLowerCase(),
					value: rawFilter[3],
				};
			}
			if (rawFilter.length >= 3) {
				return {
					field: String(rawFilter[0] || "").trim(),
					op: String(rawFilter[1] || "=").trim().toLowerCase(),
					value: rawFilter[2],
				};
			}
		}

		if (rawFilter && typeof rawFilter === "object") {
			return {
				field: String(rawFilter.fieldname || rawFilter.field || "").trim(),
				op: String(rawFilter.operator || rawFilter.op || "=").trim().toLowerCase(),
				value: rawFilter.value,
			};
		}

		return { field: "", op: "=", value: "" };
	}

	matchStandardFilter(row, rawFilter) {
		const { field, op, value } = this.normalizeStandardFilter(rawFilter);
		if (!field) return true;

		const left = this.getFilterFieldValue(row, field);
		const isAmountField = field === "amount" || field === "grand_total";
		const leftText = String(left || "").toLowerCase();

		const normalizeArrayValue = (val) => {
			if (Array.isArray(val)) return val.map((item) => String(item || "").trim()).filter(Boolean);
			return String(val || "")
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
		};

		if (op === "set") return left !== null && left !== undefined && String(left).trim() !== "";
		if (op === "not set") return left === null || left === undefined || String(left).trim() === "";

		if (op === "in") {
			const list = normalizeArrayValue(value).map((item) => item.toLowerCase());
			return list.includes(leftText);
		}

		if (op === "not in") {
			const list = normalizeArrayValue(value).map((item) => item.toLowerCase());
			return !list.includes(leftText);
		}

		if (op === "between") {
			const vals = normalizeArrayValue(value);
			if (vals.length < 2) return true;
			if (isAmountField) {
				const lhs = Number(left || 0);
				const low = Number(vals[0]);
				const high = Number(vals[1]);
				if (!Number.isFinite(low) || !Number.isFinite(high)) return true;
				return lhs >= low && lhs <= high;
			}
			return leftText >= String(vals[0] || "").toLowerCase() && leftText <= String(vals[1] || "").toLowerCase();
		}

		if (isAmountField && [">", ">=", "<", "<=", "=", "!="].includes(op)) {
			const lhs = Number(left || 0);
			const rhs = Number(value);
			if (!Number.isFinite(rhs)) return true;
			if (op === ">") return lhs > rhs;
			if (op === ">=") return lhs >= rhs;
			if (op === "<") return lhs < rhs;
			if (op === "<=") return lhs <= rhs;
			if (op === "=") return lhs === rhs;
			if (op === "!=") return lhs !== rhs;
		}

		const rightText = String(value || "").toLowerCase();
		if (!rightText && op !== "=" && op !== "!=") return true;

		if (op === "=") return leftText === rightText;
		if (op === "!=") return leftText !== rightText;
		if (op === "like") {
			const pattern = rightText.replace(/%/g, "").trim();
			return !pattern || leftText.includes(pattern);
		}
		if (op === "not like") {
			const pattern = rightText.replace(/%/g, "").trim();
			return !pattern || !leftText.includes(pattern);
		}
		if (op === ">") return leftText > rightText;
		if (op === ">=") return leftText >= rightText;
		if (op === "<") return leftText < rightText;
		if (op === "<=") return leftText <= rightText;

		return true;
	}

	formatAge(value) {
		if (!value) return "-";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(value) : new Date(value);
			if (!created) return "-";
			const diffMs = Date.now() - created.getTime();
			const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
			return `${days}d`;
		} catch (e) {
			return "-";
		}
	}

	formatCurrency(value) {
		const number = Number(value || 0);
		return `₹${number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	getStatusClass(status) {
		const map = {
			Draft: "cof-status-draft",
			"Waiting For Approval": "cof-status-waiting",
			Approved: "cof-status-approved",
			Rejected: "cof-status-rejected",
			"Order Created": "cof-status-order",
		};
		return map[status] || "cof-status-draft";
	}

	escapeAttr(value) {
		return String(value || "").replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	getCustomerAvatarText(customerName) {
		const raw = String(customerName || "").trim();
		if (!raw || raw === "-") return "NA";

		const parts = raw
			.split(/\s+/)
			.map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
			.filter(Boolean);

		if (!parts.length) return "NA";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

		return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
	}

	injectSelectedRecordInDetail() {
		if (!this.selectedRecord) return;
		
		const record = this.detailRecord || this.selectedRecord;
		const customerName = record.customer || this.selectedRecord.party || "-";
		const avatarText = this.getCustomerAvatarText(customerName);
		
		this.$content.find(".subject-label").text(`Subject · ${record.name || this.selectedRecord.id}`);
		this.$content.find(".customer-avatar").text(avatarText).attr("title", customerName);
		this.$content.find(".customer-name").text(customerName).attr("title", customerName);
		this.$content.find(".customer-sub").text(`Owner · ${record.owner || this.selectedRecord.owner}`);
		this.injectDetailMeta(record);
		this.injectDetailFinancials(record);
		this.injectItemsTable(record);
		this.injectCofPaymentTerms(record);
		
		const status = record.status || record.workflow_state || this.selectedRecord.status || "Draft";
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${status}`);
	}

	injectCofPaymentTerms(record) {
		const me = this;
		const schedule = Array.isArray(record.payment_schedule) ? record.payment_schedule : [];
		const $wrap = me.$content.find("#cofPayTermsWrap");
		if (!$wrap.length) return;

		const fmt = n => me.formatCurrency(n);
		const grandTotal = Number(record.grand_total || record.rounded_total || 0);

		const header = `
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
				<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;">Payment Terms</div>
			</div>`;

		if (!schedule.length) {
			$wrap.html(header + `<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No payment schedule on this Customer Order Form.</div>`);
			return;
		}

		const count = schedule.length;
		const total = schedule.reduce((s, p) => {
			const portion = Number(p.invoice_portion || 0);
			const amt = Number(p.payment_amount || 0) > 0 ? Number(p.payment_amount) : (grandTotal * portion / 100);
			return s + amt;
		}, 0);

		const lines = schedule.map(p => {
			const days = Number(p.credit_days || 0);
			const label = p.description || p.payment_term || "Milestone";
			const daysTxt = days > 0 ? ` (${days} days)` : "";
			return `<span style="color:#3b7ef8;font-weight:600;">${me.escapeAttr(label)}${daysTxt} · ${Number(p.invoice_portion || 0)}%</span>`;
		}).join(`<span style="color:#cbd5e1;"> / </span>`);

		$wrap.html(header + `
			<div style="background:#f8fafc;border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
				<div style="min-width:0;">
					<div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Payment Schedule</div>
					<div style="font-size:12px;white-space:normal;word-break:break-word;">${count} milestone${count !== 1 ? "s" : ""} · ${lines}</div>
				</div>
				<div style="text-align:right;flex-shrink:0;">
					<div style="font-size:22px;font-weight:700;color:#3b7ef8;font-family:Syne,sans-serif;">${fmt(total)}</div>
					<div style="font-size:11px;color:#9ca3af;">grand total, incl. tax</div>
				</div>
			</div>`);
	}


	_openCofConnectionsDropdown(btnEl, record) {
		const me = this;
		$("#cofConnectionsDropdown").remove();

		const items = [];
		if (record.quotation_id) {
			items.push({ route: "quote-list", name: record.quotation_id, icon: "ti-file-invoice", color: "#3b7ef8", label: "Quotation" });
		}

		const cofName = record.name || (me.selectedRecord && me.selectedRecord.id) || "";
		const rect = btnEl.getBoundingClientRect();

		const renderWithExtras = (extraItems) => {
			const allItems = items.concat(extraItems);
			me._paintCofConnectionsDropdown(rect, allItems);
		};

		if (!cofName) { renderWithExtras([]); return; }

		Promise.all([
			new Promise((resolve) => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Supplier Quotation",
						filters: { cof_id: cofName },
						fields: ["name"],
						limit_page_length: 50,
					},
					callback: (r) => resolve((r.message || []).map(row => row.name)),
					error: () => resolve([]),
				});
			}),
			new Promise((resolve) => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "ORC List",
						filters: { cof_id: cofName },
						fields: ["name"],
						limit_page_length: 50,
					},
					callback: (r) => resolve((r.message || []).map(row => row.name)),
					error: () => resolve([]),
				});
			}),
			new Promise((resolve) => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Sales Order",
						filters: { cof_id: cofName },
						fields: ["name"],
						limit_page_length: 50,
					},
					callback: (r) => resolve((r.message || []).map(row => row.name)),
					error: () => resolve([]),
				});
			}),
		]).then(([sqNames, orcNames, soNames]) => {
			const extra = [];
			sqNames.forEach(n => extra.push({ route: "sq-list", name: n, icon: "ti-shopping-cart", color: "#d97706", label: "Supplier Quotation" }));
			orcNames.forEach(n => extra.push({ route: "orc-list", name: n, icon: "ti-receipt-2", color: "#7c3aed", label: "ORC" }));
			soNames.forEach(n => extra.push({ route: "Form|Sales Order", name: n, icon: "ti-clipboard-check", color: "#16a34a", label: "Sales Order" }));
			renderWithExtras(extra);
		});
	}

	_paintCofConnectionsDropdown(rect, items) {
		const me = this;
		const inner = items.length
			? items.map(it => `
				<div class="cof-conn-item" data-route="${it.route}" data-name="${me.escapeAttr(it.name)}"
					style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .12s;border-bottom:1px solid rgba(0,0,0,0.05);">
					<i class="ti ${it.icon}" style="color:${it.color};font-size:16px;flex-shrink:0;"></i>
					<div style="min-width:0;">
						<div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;">${me.escapeAttr(it.name)}</div>
						<div style="font-size:10px;color:#9ca3af;">${it.label}</div>
					</div>
				</div>`).join("")
			: `<div style="padding:18px 16px;text-align:center;color:#9ca3af;font-size:12px;">No linked documents</div>`;

		const $dd = $(`
			<div id="cofConnectionsDropdown" style="position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;min-width:220px;max-width:300px;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);z-index:9999;">
				${inner}
			</div>`);
		$("body").append($dd);

		const ddRect = $dd[0].getBoundingClientRect();
		if (ddRect.right > window.innerWidth - 8) {
			$dd.css({ left: "auto", right: (window.innerWidth - rect.right) + "px" });
		}

		$dd.on("mouseenter", ".cof-conn-item", function () { $(this).css("background", "#f1f5f9"); });
		$dd.on("mouseleave", ".cof-conn-item", function () { $(this).css("background", "transparent"); });
		$dd.on("click", ".cof-conn-item", function () {
			const route = $(this).data("route");
			const name = $(this).data("name");
			$dd.remove();
			if (route === "Form|Sales Order") {
				frappe.set_route("Form", "Sales Order", name);
			} else {
				frappe.set_route(route, name);
			}
		});

		setTimeout(() => {
			$(document).on("click.cofConnDD", (ev) => {
				if (!$(ev.target).closest("#cofConnectionsDropdown, #cofBtnConnections").length) {
					$dd.remove();
					$(document).off("click.cofConnDD");
				}
			});
		}, 0);
	}

	injectDetailMeta(record) {
		const firstNonEmpty = (...values) => {
			for (const value of values) {
				const text = String(value ?? "").trim();
				if (text) return text;
			}
			return "-";
		};

		const getUserDisplayName = (userId) => {
			const user = String(userId || "").trim();
			if (!user) return "";
			const ownerOption = (this.ownerOptions || []).find(
				(option) => String(option?.value || "").trim().toLowerCase() === user.toLowerCase()
			);
			if (ownerOption) {
				const label = String(ownerOption.label || "").trim();
				const suffix = ` (${user})`;
				if (label.endsWith(suffix)) return label.slice(0, -suffix.length).trim();
				return label;
			}
			return "";
		};

		const quotationId = firstNonEmpty(record.quotation_id);
		const cofId = firstNonEmpty(record.name, this.selectedRecord?.id);
		const salesperson = firstNonEmpty(
			record.sales_person_name,
			record.sales_person,
			getUserDisplayName(record.owner),
			getUserDisplayName(this.selectedRecord?.owner)
		);
		const poRefNo = firstNonEmpty(record.po_ref_number, record.customers_purchase_order, record.customer_purchase_order, record.po_ref_no);

		this.$content.find("#cofQuotationId").text(quotationId).attr("title", quotationId);
		this.$content.find("#cofRecordId").text(cofId).attr("title", cofId);
		this.$content.find("#cofSalesperson").text(salesperson).attr("title", salesperson);
		this.$content.find("#cofPoRefNo").text(poRefNo).attr("title", poRefNo);
	}

	injectDetailFinancials(record) {
		const toNumber = (value) => {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		};

		const pickFirstNumber = (source, keys) => {
			if (!source || !Array.isArray(keys)) return null;
			for (const key of keys) {
				if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
				const raw = source[key];
				if (raw === null || raw === undefined || raw === "") continue;
				const parsed = Number(raw);
				if (Number.isFinite(parsed)) return parsed;
			}
			return null;
		};

		const items = Array.isArray(record?.items) ? record.items : [];
		const sumItems = (keys) => items.reduce((sum, item) => sum + toNumber(pickFirstNumber(item, keys)), 0);

		const sellingAmount = pickFirstNumber(record, [
			"total",
			"net_total",
			"base_total",
			"base_net_total",
			"rounded_total",
			"grand_total",
			"base_grand_total",
		]) ?? this.selectedRecord?.amount ?? 0;

		const orcAmount = pickFirstNumber(record, ["orc_amount", "total_orc_amount"]) ?? sumItems(["orc_amount", "custom_orc_amount"]);

		const explicitProfit = pickFirstNumber(record, ["profit", "total_profit", "gross_profit", "margin_amount", "total_margin_amount"]);
		const itemProfit = sumItems(["margin_amount", "gross_profit"]);
		const profitAmount = explicitProfit !== null ? explicitProfit : itemProfit;

		const explicitBuying = pickFirstNumber(record, ["buying_amount", "buying_amt", "total_buying_amount", "cost_amount", "total_cost"]);
		const computedBuying = explicitBuying !== null ? explicitBuying : Math.max(0, toNumber(sellingAmount) - toNumber(profitAmount));

		this.$content.find("#cofSellingAmt").text(this.formatCurrency(sellingAmount));
		this.$content.find("#cofBuyingAmt").text(this.formatCurrency(computedBuying));
		this.$content.find("#cofOrcAmt").text(this.formatCurrency(orcAmount));
		this.$content.find("#cofProfitAmt").text(this.formatCurrency(profitAmount));
	}

	getFirstItemValue(item, keys) {
		if (!item || typeof item !== "object") return 0;
		for (const key of keys) {
			if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
			const value = Number(item[key]);
			if (Number.isFinite(value)) return value;
		}
		return 0;
	}

	formatItemNumber(value, digits = 0) {
		const number = Number(value || 0);
		if (!Number.isFinite(number)) return "0";
		return number.toLocaleString("en-IN", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	}

	injectItemsTable(record) {
		const me = this;
		const items = Array.isArray(record?.items) ? record.items : [];
		const $wrap = me.$content.find("#cofItemsTableBody");
		const getValue = (item, keys) => me.getFirstItemValue(item, keys);
		const getText = (item, keys) => {
			for (const k of keys) {
				if (Object.prototype.hasOwnProperty.call(item, k) && item[k]) return String(item[k]);
			}
			return "";
		};
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		if (!items.length) {
			$wrap.html(`<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;">
				<i class="ti ti-inbox" style="font-size:26px;display:block;margin-bottom:8px;"></i>No items on this Customer Order Form
			</div>`);
			this.$content.find("#cofItemsTotalQty").text("0");
			this.injectItemsTotalsSummary(record, [], getValue);
			return;
		}

		let cards = "";
		items.forEach((item, idx) => {
			const qty = getValue(item, ["qty", "stock_qty", "quantity", "stock_quantity", "ordered_qty"]);
			const sellingPrice = getValue(item, ["rate", "base_rate", "selling_rate", "price", "price_list_rate", "net_rate"]);
			const sellAmount = getValue(item, ["amount", "base_net_amount", "net_amount", "base_amount", "total_amount", "subtotal"]);

			const sqId = getText(item, ["supplier_quotation", "supplier_quotation_id", "sq_id", "spq_id"]);
			const purchaseRate = getValue(item, ["buying_rate", "cost_rate", "buying_price", "purchase_rate", "spq_rate"]);
			const purchaseAmount = getValue(item, ["buying_amount", "buying_amt", "cost_amount", "purchase_amount", "total_cost", "amount_buying"]);

			const orcId = getText(item, ["orc_id", "orc", "custom_orc_id"]);
			const orcAmount = getValue(item, ["orc_amount", "custom_orc_amount", "total_orc_amount"]);

			const margin = sellAmount - (purchaseAmount + orcAmount);
			const marginColor = margin >= 0 ? "#16a34a" : "#dc2626";
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;

			const brand = item.brand || item.item_brand || "";
			const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional", "add-on": "Add-on", "monthly usage": "Monthly Usage" };
			const typeColor = { new: "#3b7ef8", renewal: "#16a34a", additional: "#d97706", "add-on": "#7c3aed", "monthly usage": "#0891b2" };
			const rstat = String(item.renewal_status || item.opportunity_type || "new");
			const tkey = rstat.toLowerCase();
			const renewId = (tkey === "renewal" || tkey === "additional") ? (item.renewal_id || "") : "";

			cards += `
<div class="ql-di-card" data-idx="${idx}">
	<div class="ql-ic-row1" style="flex-wrap:wrap;row-gap:8px;">
		<div class="ql-ic-num">${idx + 1}</div>
		<div class="ql-ic-item" style="cursor:default;flex:1 1 220px;">
			<div class="ql-ic-name">${me.escapeAttr(item.item_name || item.item_code || "—")}</div>
			<div class="ql-ic-sub">
				${item.item_code ? me.escapeAttr(item.item_code) : ""}${item.item_code && brand ? "  ·  " : ""}${brand ? me.escapeAttr(brand) : ""}${(item.item_code || brand) ? "  ·  " : ""}<span style="color:${typeColor[tkey] || "#3b7ef8"};font-weight:700;">${typeLabel[tkey] || me.escapeAttr(rstat)}</span>${renewId ? `<span class="ql-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(renewId)}</span>` : ""}
				${sqId ? `<span style="margin-left:8px;color:#9ca3af;">· SQ: ${me.escapeAttr(sqId)}</span>` : ""}
				${orcId ? `<span style="margin-left:8px;color:#9ca3af;">· ORC: ${me.escapeAttr(orcId)}</span>` : ""}
			</div>
		</div>
		<div class="ql-ic-field" style="width:52px;">
			<label class="ql-ic-label">Qty</label>
			<div class="ql-ic-roval" style="text-align:right;">${me.formatItemNumber(qty)}</div>
		</div>
		<div class="ql-ic-field" style="width:100px;">
			<label class="ql-ic-label">Rate (₹)</label>
			<div class="ql-ic-roval" style="text-align:right;">₹${fmtINR(sellingPrice)}</div>
		</div>
		<div class="ql-ic-field" style="width:110px;">
			<label class="ql-ic-label">Sell Amt</label>
			<div class="ql-ic-roval ql-ic-amt" style="text-align:right;">₹${fmtINR(sellAmount)}</div>
		</div>
		<div class="ql-ic-field" style="width:110px;">
			<label class="ql-ic-label">Buy Amt</label>
			<div class="ql-ic-roval" style="text-align:right;">₹${fmtINR(purchaseAmount)}</div>
		</div>
		<div class="ql-ic-field" style="width:90px;">
			<label class="ql-ic-label">ORC Amt</label>
			<div class="ql-ic-roval" style="text-align:right;">${orcId ? "₹" + fmtINR(orcAmount) : "—"}</div>
		</div>
		<div class="ql-ic-field" style="width:110px;">
			<label class="ql-ic-label">Margin</label>
			<div class="ql-ic-roval" style="text-align:right;font-weight:700;color:${marginColor};">₹${fmtINR(margin)}</div>
		</div>
		<div class="ql-ic-field" style="width:34px;align-items:center;">
			<label class="ql-ic-label">Desc</label>
			<button class="ql-ic-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button" title="View description"><i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i></button>
		</div>
	</div>
</div>`;
		});

		$wrap.html(cards);

		me.$content.off("click.cofDIDesc", "#cofItemsTableBody .ql-ic-desc-btn")
			.on("click.cofDIDesc", "#cofItemsTableBody .ql-ic-desc-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				me.openCofDetailDescView(idx, items[idx]);
			});

		const totalQty = items.reduce((s, it) => s + getValue(it, ["qty", "stock_qty", "quantity", "stock_quantity", "ordered_qty"]), 0);
		this.$content.find("#cofItemsTotalQty").text(this.formatItemNumber(totalQty));

		this.injectItemsTotalsSummary(record, items, getValue);
	}

	injectItemsTotalsSummary(record, items, getValue) {
		const totalSell = items.reduce((sum, item) => sum + getValue(item, ["amount", "base_net_amount", "net_amount", "base_amount", "total_amount", "subtotal"]), 0);
		const recordTaxAmount = this.getFirstItemValue(record, ["total_taxes", "total_tax", "tax_amount", "tax_total"]);
		const itemTaxTotal = items.reduce((sum, item) => sum + getValue(item, ["tax_amount", "tax"]), 0);
		const actualTaxAmount = recordTaxAmount || itemTaxTotal;

		const taxNameValues = Array.isArray(record?.taxes)
			? record.taxes.map((tax) => String(tax?.account_head || tax?.tax_type || tax?.description || "").toUpperCase())
			: [];
		const hasIGST = taxNameValues.some((value) => value.includes("IGST"));
		const hasCGST = taxNameValues.some((value) => value.includes("CGST"));
		const hasSGST = taxNameValues.some((value) => value.includes("SGST"));

		let taxAmount = 0;
		let taxTypeLabel = "0%";
		if (hasIGST) {
			taxAmount = totalSell * 0.18;
			taxTypeLabel = "IGST 18%";
		} else if (hasCGST && hasSGST) {
			taxAmount = totalSell * 0.18;
			taxTypeLabel = "CGST 9% + SGST 9%";
		}
		if (actualTaxAmount > 0) {
			taxAmount = actualTaxAmount;
		}

		const grandTotal = Number(record?.grand_total ?? (totalSell + taxAmount)) || totalSell + taxAmount;

		this.$content.find("#cofItemsSellAmt").text(`₹${this.formatItemNumber(totalSell, 2)}`);
		this.$content.find("#cofItemsTaxLabel").text(`Tax (${taxTypeLabel})`);
		this.$content.find("#cofItemsTax").text(`₹${this.formatItemNumber(taxAmount, 2)}`);
		this.$content.find("#cofItemsGrandTotal").text(this.formatCurrency(grandTotal));
	}

	// read-only description viewer for detail-view items
	openCofDetailDescView(idx, item) {
		if (!item) return;
		const desc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length
			? item.description
			: "<i style='color:#9ca3af;'>No description</i>";
		frappe.msgprint({
			title: item.item_name || item.item_code || `Item ${idx + 1}`,
			message: desc,
			indicator: "blue",
		});
	}

	setPageTitle() {
		if (this.view === "list") {
			document.title = "Customer Order Forms";
			this.page.set_title("Customer Order Forms");
			if (this.page && this.page.clear_secondary_action) {
				this.page.clear_secondary_action();
			}
			return;
		}

		const customerName = this.$content.find(".customer-name").text().trim();
		const title = customerName ? `Opportunity Detail — ${customerName}` : "Opportunity Detail";
		document.title = title;
		this.page.set_title(title);
		if (this.page && this.page.clear_secondary_action) {
			this.page.clear_secondary_action();
		}
	}

	bindActivityFilters() {
		const $tabs = this.$content.find("#actTabs");
		const $filter = this.$content.find("#actFilter");

		$tabs.off("click.coflist", ".tab").on("click.coflist", ".tab", (event) => {
			const $tab = $(event.currentTarget);
			$tabs.find(".tab").removeClass("active");
			$tab.addClass("active");
			this.activeTab = String($tab.data("tab") || "notes");
			this.applyFilter();
		});

		$filter.off("click.coflist", ".tab").on("click.coflist", ".tab", (event) => {
			const $tab = $(event.currentTarget);
			$filter.find(".tab").removeClass("active");
			$tab.addClass("active");
			this.activeFilter = String($tab.data("filter") || "all");
			this.applyFilter();
		});

		this.applyFilter();
	}

	bindEnhancedActions() {
		this.$content.off("click.coflistActions");
		this.$content.on("click.coflistActions", "[data-action='toggle-workflow']", (event) => {
			event.stopPropagation();
			this.$content.find("#wfDropdown").toggleClass("open");
		});

		this.$content.on("click.coflistActions", "#cofBtnConnections", (event) => {
			event.stopPropagation();
			const record = this.detailRecord || this.selectedRecord;
			if (!record) return;
			this._openCofConnectionsDropdown(event.currentTarget, record);
		});

		this.$content.on("click.coflistActions", "[data-action='save-note']", () => {
			window.saveNote();
		});

		this.$content.on("click.coflistActions", "[data-action='save-comment']", () => {
			window.saveComment();
		});

		this.$content.on("click.coflistActions", "[data-close-tab]", (event) => {
			const tab = String($(event.currentTarget).data("closeTab") || "");
			if (tab) window.closeInput(tab);
		});

		this.$content.on("click.coflistActions", ".mention-item[data-mention]", (event) => {
			const name = String($(event.currentTarget).data("mention") || "");
			if (name) window.insertMention(name);
		});

		this.$content.on("click.coflistActions", "#cofBtnCreateSO", () => {
			this.createSalesOrderFromCof();
		});

		this.$content.on("input.coflistActions", "#commentText", (event) => {
			window.handleMention(event.currentTarget);
		});

		this.$content.on("click.coflistActions", "[data-toggle-input]", (event) => {
			const tab = String($(event.currentTarget).data("toggleInput") || "");
			if (tab) window.toggleInput(tab);
		});

		window.toggleInput = (tab) => {
			const cfg = this.tabConfig[tab];
			if (!cfg || !cfg.inputId) return;
			const $el = this.$content.find(`#${cfg.inputId}`);
			const isOpen = $el.is(":visible");
			this.closeAllInputs();
			if (!isOpen) {
				$el.removeClass("hidden").show();
				const first = $el.find("textarea,input").get(0);
				if (first) first.focus();
			}
		};

		window.closeInput = (tab) => {
			const cfg = this.tabConfig[tab];
			if (!cfg || !cfg.inputId) return;
			this.$content.find(`#${cfg.inputId}`).addClass("hidden").hide();
		};

		window.saveNote = () => {
			const $note = this.$content.find("#noteText");
			const txt = ($note.val() || "").trim();
			if (!txt) return;
			const $item = $(
				`<div class="act-item" data-tab="notes" data-status="completed">
					<div class="act-icon note"><i class="ti ti-notes"></i></div>
					<div class="act-body"><div class="act-title"></div><div class="act-meta">Added by You · Just now</div></div>
					<span class="act-type">Note</span>
				</div>`
			);
			$item.find(".act-title").text(txt);
			this.$content.find("#activityList").prepend($item);
			$note.val("");
			window.closeInput("notes");
			this.applyFilter();
		};

		window.saveComment = () => {
			const $comment = this.$content.find("#commentText");
			const txt = ($comment.val() || "").trim();
			if (!txt) return;
			const $item = $(
				`<div class="act-item" data-tab="comments" data-status="completed">
					<div class="act-icon note"><i class="ti ti-message-circle"></i></div>
					<div class="act-body"><div class="act-title"></div><div class="act-meta">You · Just now</div></div>
					<span class="act-type">Comment</span>
				</div>`
			);
			$item.find(".act-title").text(txt);
			this.$content.find("#activityList").prepend($item);
			$comment.val("");
			this.$content.find("#mentionDropdown").addClass("hidden").hide();
			window.closeInput("comments");
			this.applyFilter();
		};

		window.handleMention = (el) => {
			const val = el.value || "";
			const lastAt = val.lastIndexOf("@");
			const $dd = this.$content.find("#mentionDropdown");
			if (!$dd.length) return;
			if (lastAt !== -1 && lastAt === val.length - 1) {
				$dd.removeClass("hidden").show();
			} else {
				$dd.addClass("hidden").hide();
			}
		};

		window.insertMention = (name) => {
			const $ta = this.$content.find("#commentText");
			const val = String($ta.val() || "");
			const lastAt = val.lastIndexOf("@");
			$ta.val(`${val.slice(0, lastAt)}@${name} `);
			this.$content.find("#mentionDropdown").addClass("hidden").hide();
			$ta.trigger("focus");
		};

		$(document)
			.off("click.coflist")
			.on("click.coflist", (e) => {
				const wfWrap = this.$content.find("#wfWrap").get(0);
				if (!wfWrap || !wfWrap.contains(e.target)) {
					this.$content.find("#wfDropdown").removeClass("open");
				}
				const mentionDropdown = this.$content.find("#mentionDropdown").get(0);
				if ((!mentionDropdown || !mentionDropdown.contains(e.target)) && e.target.id !== "commentText") {
					this.$content.find("#mentionDropdown").addClass("hidden").hide();
				}
			});
	}

	closeAllInputs() {
		this.$content.find(".act-input-area").addClass("hidden").hide();
	}

	renderBottomBtn() {
		const cfg = this.tabConfig[this.activeTab];
		const $bottom = this.$content.find("#actBottom");
		if (!cfg || !cfg.label) {
			$bottom.empty();
			return;
		}
		$bottom.html(
			`<button class="add-btn" type="button" data-toggle-input="${this.activeTab}"><i class="ti ${cfg.icon}"></i> ${cfg.label}</button>`
		);
	}


	createSalesOrderFromCof() {
		const me = this;
		const record = me.detailRecord || me.selectedRecord;
		if (!record || !record.name) {
			frappe.show_alert({ message: "COF record not loaded.", indicator: "red" });
			return;
		}

		const items = Array.isArray(record.items) ? record.items : [];
		if (!items.length) {
			frappe.msgprint("This COF has no items to create a Sales Order from.");
			return;
		}

		frappe.confirm(
			`Create a Sales Order from ${frappe.utils.escape_html(record.name)}?`,
			() => {
				const today = frappe.datetime.get_today();

				const soItems = items.map(it => ({
					item_code: it.item_code || "",
					item_name: it.item_name || it.item_code || "",
					description: it.description || it.item_name || it.item_code || "",
					qty: Number(it.qty || 0),
					uom: it.uom || "Nos",
					conversion_factor: 1,
					rate: Number(it.rate || 0),
					amount: Number(it.amount || (Number(it.qty || 0) * Number(it.rate || 0))),
					delivery_date: today,
				}));

				const taxRows = Array.isArray(record.taxes) ? record.taxes.map(t => ({
					charge_type: t.charge_type,
					account_head: t.account_head,
					description: t.description,
					rate: t.rate,
					cost_center: t.cost_center,
					included_in_print_rate: t.included_in_print_rate,
				})) : [];

				const paymentSchedule = Array.isArray(record.payment_schedule) ? record.payment_schedule.map(p => ({
					description: p.description,
					due_date: p.due_date,
					invoice_portion: p.invoice_portion,
					payment_amount: p.payment_amount,
				})) : [];

				const doc = {
					doctype: "Sales Order",
					customer: record.customer || "",
					customer_name: record.customer_name || "",
					company: record.company_name || record.company || "",
					order_type: "Sales",
					transaction_date: today,
					delivery_date: today,
					cof_id: record.name,
					quotation_id: record.quotation_id || "",
					customer_address: record.customer_address || "",
					shipping_address_name: record.shipping_address_name || "",
					contact_person: record.contact_person || "",
					contact_email: record.contact_email || "",
					po_no: record.po_ref_number || record.customers_purchase_order || "",
					tax_category: record.tax_category || "",
					taxes_and_charges: record.taxes_and_charges || "",
					taxes: taxRows,
					payment_terms_template: record.payment_terms_template || "",
					payment_schedule: paymentSchedule,
					items: soItems,
				};

				const $btn = me.$content.find("#cofBtnCreateSO");
				$btn.prop("disabled", true).html('<i class="ti ti-loader"></i> Creating…');

				frappe.call({
					method: "frappe.client.insert",
					args: { doc },
					callback: (r) => {
						$btn.prop("disabled", false).html('<i class="ti ti-shopping-cart"></i> Create Sales Order');
						if (r.message) {
							frappe.show_alert({ message: `Sales Order ${r.message.name} created!`, indicator: "green" });
							frappe.set_route("Form", "Sales Order", r.message.name);
						}
					},
					error: () => {
						$btn.prop("disabled", false).html('<i class="ti ti-shopping-cart"></i> Create Sales Order');
						frappe.show_alert({ message: "Failed to create Sales Order.", indicator: "red" });
					},
				});
			}
		);
	}

	applyFilter() {
		const isAttach = this.activeTab === "attachments";
		const $activityList = this.$content.find("#activityList");
		const $attachPanel = this.$content.find("#attachmentsPanel");
		const $filterDivider = this.$content.find("#filterDivider");
		const $filter = this.$content.find("#actFilter");
		const $actBottom = this.$content.find("#actBottom");

		$activityList.toggle(!isAttach);
		$attachPanel.toggleClass("hidden", !isAttach).toggle(isAttach);
		$filterDivider.toggle(!isAttach);
		$filter.toggle(!isAttach);
		$actBottom.toggle(!isAttach);

		if (!isAttach) {
			this.$content.find("#activityList .act-item").each((_, item) => {
				const $item = $(item);
				const tabMatch = $item.data("tab") === this.activeTab;
				const filterMatch = this.activeFilter === "all" || $item.data("status") === this.activeFilter;
				$item.css("display", tabMatch && filterMatch ? "flex" : "none");
			});
		}

		this.closeAllInputs();
		this.renderBottomBtn();
	}

	renderWorkflow() {
		const record = this.detailRecord || this.selectedRecord;
		const status = record?.status || record?.workflow_state || this.selectedRecord?.status || "Draft";
		
		// Map status to stage index
		const statusToStageMap = {
			"Draft": 0,
			"Waiting For Approval": 1,
			"Waiting for Approval": 1,
			"Pending Approval": 1,
			"Approved": 2,
			"Rejected": 3,
			"Order Created": 4,
		};
		
		this.currentStage = Object.prototype.hasOwnProperty.call(statusToStageMap, status) ? statusToStageMap[status] : 0;
		const stage = this.wfStages[this.currentStage];
		
		const $dot = this.$content.find("#wfDot");
		const $stageLabel = this.$content.find("#wfStageLabel");
		const $statusBadge = this.$content.find("#statusBadge");
		const $actions = this.$content.find("#wfActions");

		$dot.css("background", stage.dot);
		$stageLabel.text(stage.label);
		$statusBadge
			.html(`<i class="ti ti-circle-dot"></i> ${status}`)
			.css({
				background: `${stage.dot}1a`,
				color: stage.dot,
				border: `1px solid ${stage.dot}33`,
			});

		$actions.empty();
		if (!stage.actions.length) {
			$actions.html('<div style="padding:10px;font-size:12px;color:#9ca3af;text-align:center;">No further actions</div>');
			return;
		}

		stage.actions.forEach((action) => {
			const $item = $(
				`<div class="wf-action-item">
					<div class="wf-icon" style="background:${action.bg};color:${action.color};"><i class="ti ${action.icon}"></i></div>
					<div><div>${action.label}</div><div class="wf-desc">${action.desc}</div></div>
				</div>`
			);
			$item.on("click", () => {
				this.currentStage = action.next;
				this.renderWorkflow();
				this.$content.find("#wfDropdown").removeClass("open");
			});
			$actions.append($item);
		});
	}
}	


	// ═══════════════════════════════════════════════════════════
//  COF NEW-FORM TEMPLATE
// ═══════════════════════════════════════════════════════════
frappe.cof_list_page_template = {
	newForm: `
	<div class="ql-page">
		<div class="page-wrap">

			<ol class="breadcrumb" style="background:transparent;padding:0;margin-bottom:16px;">
				<li class="breadcrumb-item"><a href="javascript:void(0)">CRM</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;"><a href="javascript:void(0)" class="ql-back-btn">Customer Order Forms</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;">New COF</li>
			</ol>

			<!-- Source banner -->
			<div style="background:linear-gradient(135deg,#3b7ef8 0%,#2563eb 100%);border-radius:12px;padding:14px 18px;color:#fff;margin-bottom:18px;display:flex;align-items:center;gap:16px;">
				<i class="ti ti-file-import" style="font-size:22px;"></i>
				<div>
					<div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Creating COF from Quotation</div>
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;margin-top:2px;"><span id="cofWizQuote">—</span> · <span id="cofWizCustomer">—</span></div>
				</div>
			</div>

			<!-- Progress -->
			<div style="margin-bottom:20px;">
				<div style="height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;">
					<div id="cofProgressFill" style="height:100%;width:16.66%;background:#3b7ef8;border-radius:2px;transition:width 0.4s ease;"></div>
				</div>
			</div>

			<!-- Stepper -->
			<div style="display:flex;align-items:flex-start;margin-bottom:28px;">
				<div class="ql-step active" data-step="1" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">1</div><div class="ql-step-label">Info</div></div>
				<div class="ql-step" data-step="2" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">2</div><div class="ql-step-label">Contacts</div></div>
				<div class="ql-step" data-step="3" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">3</div><div class="ql-step-label">Address</div></div>
				<div class="ql-step" data-step="4" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">4</div><div class="ql-step-label">Items</div></div>
				<div class="ql-step" data-step="5" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">5</div><div class="ql-step-label">Taxes</div></div>
				<div class="ql-step" data-step="6" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">6</div><div class="ql-step-label">Payment</div></div>
				<div class="ql-step" data-step="7" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"><div class="ql-step-circle">7</div><div class="ql-step-label">Review</div></div>
			</div>

			<!-- STEP 1: INFO -->
			<div class="ql-wiz-panel active" id="cofPanel1">
				<div class="card">
					<div class="card-title">Order Information</div>
					<div class="card-subtitle">Enter the PO details. Customer info carries over from the quotation.</div>

					<div class="ql-field" style="margin-bottom:16px;">
						<label class="ql-field-label">Subject</label>
						<input class="ql-field-input" id="cofFSubject" placeholder="Subject" style="height:42px;">
					</div>

					<div class="ql-wiz-grid" style="margin-bottom:16px;">
						<div class="ql-field">
							<label class="ql-field-label">PO Ref No <span class="ql-req">*</span></label>
							<input class="ql-field-input" id="cofFPoRef" placeholder="Customer PO reference">
						</div>
						<div class="ql-field">
							<label class="ql-field-label">Priority</label>
							<select class="ql-field-input" id="cofFPriority">
								<option value="">Select priority…</option>
								<option>Normal [10 Days]</option>
								<option>Medium [1 Week]</option>
								<option>High [3-4 Days]</option>
								<option>Same Day [Today]</option>
								<option>Offer Priority</option>
								<option>Back to Back [4-6 Weeks]</option>
							</select>
						</div>
					</div>

					<div class="ql-field">
						<label class="ql-field-label">PO Attachment</label>
						<div id="cofPoUploadZone" style="border:2px dashed rgba(0,0,0,0.14);border-radius:12px;padding:22px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;background:#f7f8fa;text-align:center;">
							<i class="ti ti-cloud-upload" style="font-size:28px;color:#9ca3af;"></i>
							<p style="font-size:13px;color:#6b7280;font-weight:500;margin:0;">Click to upload PO copy</p>
							<span style="font-size:11px;color:#9ca3af;">PDF, image, or document</span>
						</div>
						<div id="cofPoFileWrap" style="display:none;margin-top:10px;align-items:center;gap:10px;padding:8px 12px;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;">
							<i class="ti ti-file-check" style="font-size:18px;color:#16a34a;"></i>
							<span id="cofPoFileName" style="flex:1;font-size:12px;font-weight:500;color:#111827;"></span>
							<i class="ti ti-x" id="cofPoFileRemove" style="font-size:14px;color:#9ca3af;cursor:pointer;"></i>
						</div>
					</div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn ql-back-btn" type="button"><i class="ti ti-arrow-left"></i> Cancel</button>
					<button class="btn btn-primary" data-wiz-next="2" type="button">Next: Contacts <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- STEP 2: CONTACTS -->
			<div class="ql-wiz-panel" id="cofPanel2">
				<div class="card">
					<div class="card-title">Contacts</div>
					<div class="card-subtitle">Carried over from the quotation.</div>
					<div id="cofContactsList" style="display:flex;flex-direction:column;gap:10px;margin-top:12px;"></div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="1" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="3" type="button">Next: Address <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- STEP 3: ADDRESS -->
			<div class="ql-wiz-panel" id="cofPanel3">
				<div class="card">
					<div class="card-title">Address</div>
					<div class="card-subtitle">Carried over from the quotation.</div>
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px;">
						<div><label class="ql-field-label" style="display:block;margin-bottom:8px;">Billing Address</label><div id="cofBillingCard"></div></div>
						<div><label class="ql-field-label" style="display:block;margin-bottom:8px;">Shipping Address</label><div id="cofShippingCard"></div></div>
						<div style="grid-column:1/-1;"><label class="ql-field-label" style="display:block;margin-bottom:8px;">Company Address</label><div id="cofCompanyCard"></div></div>
					</div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="2" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="4" type="button">Next: Items <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- STEP 4: ITEMS -->
			<div class="ql-wiz-panel" id="cofPanel4">
				<div class="card">
					<div class="card-title">Items</div>
					<div class="card-subtitle">Carried over from the quotation.</div>
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;background:#f8fafc;margin-top:12px;">
						<div id="cofItemsBody" style="max-height:420px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;"></div>
					</div>
					<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">
						<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span><span id="cofItemsQty" style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#111827;">0</span></div>
						<div style="text-align:right;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Total</div><div id="cofItemsGrand" style="font-family:Syne,sans-serif;font-size:20px;font-weight:700;color:#3b7ef8;">₹ 0.00</div></div>
					</div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="3" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="5" type="button">Next: Taxes <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- STEP 5: TAXES -->
			<div class="ql-wiz-panel" id="cofPanel5">
				<div class="card">
					<div class="card-title">Taxes &amp; Charges</div>
					<div class="card-subtitle">Carried over from the quotation.</div>
					<div class="ql-wiz-grid" style="margin-top:12px;">
						<div class="ql-field"><label class="ql-field-label">Tax Category</label><div id="cofTaxCategory" style="font-size:13px;color:#111827;padding:8px 0;">—</div></div>
						<div class="ql-field"><label class="ql-field-label">Tax Template</label><div id="cofTaxTemplate" style="font-size:13px;color:#111827;padding:8px 0;">—</div></div>
					</div>
					<div id="cofTaxesBody"></div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="4" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="6" type="button">Next: Payment &amp; Terms <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- STEP 6: PAYMENT & TERMS -->
			<div class="ql-wiz-panel" id="cofPanel6">
				<div class="card">
					<div class="card-title">Payment &amp; Terms</div>
					<div class="card-subtitle">Carried over from the quotation (read-only).</div>
					<div style="margin-top:10px;font-size:12px;color:#6b7280;">Payment terms: <span id="cofPayTermsName">—</span> · T&amp;C: <span id="cofTcName">—</span></div>
					<div id="cofTermsContent" style="margin-top:14px;font-size:12px;color:#374151;line-height:1.6;border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:12px 14px;background:#f8fafc;max-height:200px;overflow-y:auto;display:none;"></div>
					<div id="cofRevPaymentSchedule" style="margin-top:16px;"></div>
					<div id="cofRevMarginTable" style="margin-top:16px;"></div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="5" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="7" type="button">Review &amp; Submit <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- STEP 7: REVIEW -->
			<div class="ql-wiz-panel" id="cofPanel7">
				<div class="card">
					<div class="card-title">Review &amp; Submit</div>
					<div class="card-subtitle">Confirm before creating the COF.</div>
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
						<div class="ql-review-row"><span>Quotation</span><span id="cofRevQuote">—</span></div>
						<div class="ql-review-row"><span>Customer</span><span id="cofRevCustomer">—</span></div>
						<div class="ql-review-row"><span>Subject</span><span id="cofRevSubject">—</span></div>
						<div class="ql-review-row"><span>PO Ref No</span><span id="cofRevPoRef">—</span></div>
						<div class="ql-review-row"><span>Priority</span><span id="cofRevPriority">—</span></div>
						<div class="ql-review-row"><span>PO Attachment</span><span id="cofRevPoFile">—</span></div>
						<div class="ql-review-row"><span>Items</span><span id="cofRevItems">0</span></div>
						<div class="ql-review-row"><span>Contacts</span><span id="cofRevContacts">0</span></div>
					</div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="6" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" id="cofSubmitForm" type="button" style="background:#16a34a;border-color:transparent;"><i class="ti ti-check"></i> Create COF</button>
				</div>
			</div>

		</div>
	</div>`,
};
