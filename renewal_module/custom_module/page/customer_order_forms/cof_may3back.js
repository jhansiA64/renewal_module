
(() => {

	frappe.pages['customer-order-forms'].on_page_load = function (wrapper) {
		new customerorderformsdatapage(wrapper);
	};

	frappe.pages['customer-order-forms'].on_page_show = function (wrapper) {
		$('body').attr('data-route', 'customer-order-forms');   // ⭐ IMPORTANT FIX ⭐

		console.log("🔄 customer-order-forms page showing");
		const pageWrapper = wrapper || $(".page")[0] || document.body;

		const ensureSupportLayoutLoaded = (cb) => {
			if (typeof loadSupportLayout === "function") return cb();
			frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
				setTimeout(cb, 10);
			});
			frappe.require([
				"/assets/renewal_module/css/issue_themes/support_theme2.css"
			]);
		};

		ensureSupportLayoutLoaded(() => {
			loadSupportLayout(pageWrapper, () => {
				if (!frappe.customer_order_forms_page || frappe.customer_order_forms_page.wrapper !== pageWrapper) {
					frappe.customer_order_forms_page = new customerorderformsdatapage(pageWrapper);
				}
				frappe.customer_order_forms_page.render();
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

	function fmtCurrency(val, currency = null) {
		const normalizeFormatted = (formatted) => {
			const text = $("<div>").html(formatted == null ? "" : String(formatted)).text().trim();
			return text || String(formatted ?? "");
		};

		// Currency formatter with multiple fallbacks
		if (frappe?.utils?.format_currency) {
			return normalizeFormatted(frappe.utils.format_currency(val, currency));
		}
		if (frappe && typeof frappe.format === "function") {
			return normalizeFormatted(frappe.format(val, { fieldtype: "Currency" }));
		}
		try {
			return normalizeFormatted(Number(val || 0).toLocaleString(undefined, { style: "currency", currency: currency || "USD" }));
		} catch {
			return normalizeFormatted(String(val ?? ""));
		}
	}

	function fmtInt(val) {
		const num = Number(val || 0);
		if (!Number.isFinite(num)) return "0";
		return Math.trunc(num).toLocaleString();
	}

	function getQuotationAmount(doc = {}) {
		const keys = [
			OPP_CFG?.AMOUNT_FIELD,
			"amount",
			"opportunity_amount",
			"base_opportunity_amount",
			"grand_total",
			"rounded_total",
			"base_grand_total",
		].filter(Boolean);

		const toNumber = (value) => {
			if (typeof value === "number") return Number.isFinite(value) ? value : null;
			if (typeof value === "string") {
				const cleaned = value.replace(/,/g, "").replace(/[^0-9.-]/g, "").trim();
				if (!cleaned) return null;
				const parsed = parseFloat(cleaned);
				return Number.isFinite(parsed) ? parsed : null;
			}
			return null;
		};

		for (const key of keys) {
			if (!Object.prototype.hasOwnProperty.call(doc, key)) continue;
			const parsed = toNumber(doc[key]);
			if (parsed !== null) return parsed;
		}
		return 0;
	}

	function canReadDoctype(doctype) {
		const dt = String(doctype || "").trim();
		if (!dt) return false;

		try {
			if (frappe?.model?.can_read) {
				return !!frappe.model.can_read(dt);
			}

			const readable = frappe?.boot?.user?.can_read;
			if (Array.isArray(readable)) {
				return readable.includes(dt);
			}
		} catch (e) {
			// If the permission API is unavailable, avoid hard-blocking UI.
		}

		return true;
	}




	// ---- CONFIG ----
	const OPP_CFG = {
		ROUTE: "customer-order-forms",
		DOCTYPE: "Customer Order Form",
		TITLE_FIELD: "name",                 // change if your quotation title field is different
		PARTY_FROM_FIELD: "quotation_to",
		PARTY_NAME_FIELD: "customer",
		STATUS_FIELD: "status",
		// PROBABILITY_FIELD: "probability",
		AMOUNT_FIELD: "grand_total",
		EXPECTED_CLOSE_FIELD: "transaction_date",
		VALID_TILL_FIELD: "valid_till",
		WORK_OWNER_FIELD: "owner",

		// Back-end endpoints for this page
		API: {
			get_filters: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_filters",
			get_list_data: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_list_data",
			get_customer_options: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_customer_options",
			get_users_basic_info: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_users_basic_info",
			get_sales_person_details: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_sales_person_details",
			get_quotation_analytics: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_quotation_analytics",
			make_quotation_from_quotation: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.make_quotation_from_quotation"
		},

		// localStorage keys
		LS: {
			page_len: "customer_order_forms_page_length",
			last_filters: "customer_order_forms_last_filters"
		}
	};

	const OPP_UI_VERSION = "inline-editor-2026-03-13-v1";


	// ---- PAGE CLASS ----
	class customerorderformsdatapage {
		constructor(wrapper) {
			this.wrapper = wrapper;
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: "Customer Order Form List",
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
			// this.active_probability = "";
			this.selectedOwners = [];
			this.saved_filters = []; // advanced popover filters (optional)
		}


		// Returns the badge class for a given status in the detail view
		getDetailStatusBadgeClass(status) {
			if (!status) return "badge--blue";
			const s = String(status).toLowerCase();
			if (s.includes("draft")) return "badge--blue";
			if (s.includes("waiting for approval")) return "badge--warning";
			if (s.includes("approved")) return "badge--success";
			if (s.includes("rejected")) return "badge--danger";
			if (s.includes("pending sales order")) return "badge--orange";
			if (s.includes("pending purchase order")) return "badge--orange";
			if (s.includes("pending client input")) return "badge--warning";
			if (s.includes("waiting for payment")) return "badge--warning";
			if (s.includes("pending inward material")) return "badge--warning";
			if (s.includes("pending customer invoice")) return "badge--warning";
			if (s.includes("duplicate")) return "badge--danger";
			if (s.includes("closed")) return "badge--success";
			return "badge--blue";
		}

		normalizeDateForDoc(value, fallback = "") {
			const fallbackRaw = String(fallback || "").trim();
			const raw = String(value || "").trim();

			if (!raw) {
				return /^\d{4}-\d{2}-\d{2}$/.test(fallbackRaw) ? fallbackRaw : "";
			}

			const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			if (isoDateOnly) {
				return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;
			}

			// Accept ISO datetime values and keep only the date portion.
			const isoDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s].*$/);
			if (isoDateTime) {
				return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}`;
			}

			const slashIso = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
			if (slashIso) {
				return `${slashIso[1]}-${slashIso[2]}-${slashIso[3]}`;
			}

			if (frappe?.datetime?.user_to_str) {
				const converted = String(frappe.datetime.user_to_str(raw) || "").trim();
				if (/^\d{4}-\d{2}-\d{2}$/.test(converted)) {
					return converted;
				}
			}

			return /^\d{4}-\d{2}-\d{2}$/.test(fallbackRaw) ? fallbackRaw : "";
		}

		prepareDocForSave(doc) {
			if (!doc || typeof doc !== "object") return doc;
			if (Number(doc.docstatus || 0) !== 1) return doc;

			doc.ignore_validate_update_after_submit = 1;
			doc.flags = {
				...(doc.flags || {}),
				ignore_validate_update_after_submit: 1,
			};
			return doc;
		}

		render() {
			$('body').attr('data-route', 'customer-order-forms');   // ⭐ IMPORTANT FIX ⭐

			const waitForContent = () => {
				const $content = $("#support-page-content");
				if (!$content.length) return setTimeout(waitForContent, 50);
				const template =
					frappe.customer_order_forms_page_template ||
					frappe.quotation_list_page_template ||
					frappe.opportunity_list_page_template ||
					null;

				$content.empty().append(template?.body || "");
				if (!template?.body) {
					console.warn("customer-order-forms page template is missing; rendering empty content shell.");
				}
				this.handleRoute();
			};
			waitForContent();
		}

		handleRoute() {
			this.setActiveSidebar();
			const route = frappe.get_route();
			// customer-order-forms
			if (route.length === 1) return this.show_list();
			// customer-order-forms/new
			if (route.length === 2 && route[1] === "new") return this.show_new();
			// customer-order-forms/<name>
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

		getPageScope() {
			// Helper to get the correct scope where template content is rendered
			// The template is appended to #support-page-content, not inside this.page.wrapper
			const $supportContent = $("#support-page-content");
			if ($supportContent.length) return $supportContent;
			return $(this.page.wrapper);
		}

		switchView(active) {
			// Search in both this.page.wrapper and #support-page-content since the template is appended to #support-page-content
			const $scope = this.getPageScope();
			const $views = $scope.find(
				".customer-order-forms-list, .customer-order-forms-details, .customer-order-forms-new, .quotation-list-list, .quotation-list-details, .quotation-list-new"
			);
			$views.addClass("d-none").hide();

			if (active === "list") {
				$scope.find(".customer-order-forms-list, .quotation-list-list").removeClass("d-none").show();
				return;
			}
			if (active === "details") {
				$scope.find(".customer-order-forms-details, .quotation-list-details").removeClass("d-none").show();
				return;
			}
			if (active === "new") {
				$scope.find(".customer-order-forms-new, .quotation-list-new").removeClass("d-none").show();
			}
		}

		// -------- VIEWS --------
		show_list() {
			$(window).off("resize.oppLineItemsWidth");
			this.closeListFilterUi();
			this.switchView("list");

			$(this.page.wrapper)
				.off("click", "#new-customer-order-form-btn, #new-opportunity-btn")
				.on("click", "#new-customer-order-form-btn, #new-opportunity-btn", function (e) {
					e.preventDefault();
					frappe.set_route(OPP_CFG.ROUTE, "new");
				});

			setTimeout(async () => {
				this.setTitle("Customer Order Forms");
				this.bindPaginationEvents();
				this.bindFilterEvents();
				await this.loadFilters();
				this.applyUrlFilters(); // this triggers first fetch
			}, 150);
		}

		async show_details(name) {
			this.closeListFilterUi();
			this.switchView("details");
			this.setTitle(`customer-order-forms/${name}`);
			this._currentOpportunityName = name;
			this._currentOpportunityDoc = null;
			this._addNewOppItemRow = async (row = {}) => {
				await this.addDetailItemRow(row, { openInlineEditor: false, persist: true });
			};
			this.bindLineItemsFullWidth();
			this.bindDialogCloseFix();
			this.updateLineItemsFullWidth();

			// Load the document and bind actions
			await this.load_doc_details(name);
			this.bind_doc_actions(name);
			this.bindDescriptionEditor(name);
			this.init_attachment_section(name);
			this.bindTabEvents();
			this.initPanelDefaults();
			this.bind_connections_button(name);
		}

		bindDialogCloseFix() {
			$(document)
				.off("click.oppDialogCloseFix")
				.on("click.oppDialogCloseFix", ".modal .btn-modal-close, .modal .close", function (e) {
					e.preventDefault();
					e.stopPropagation();

					const $modal = $(this).closest(".modal");
					if (!$modal.length) return;

					try {
						if (window.bootstrap?.Modal) {
							const modalEl = $modal.get(0);
							const instance = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
							instance.hide();
						} else if (typeof $modal.modal === "function") {
							$modal.modal("hide");
						} else {
							$modal.removeClass("show").hide();
							$("body").removeClass("modal-open");
							$(".modal-backdrop").remove();
						}
					} catch (err) {
						$modal.removeClass("show").hide();
						$("body").removeClass("modal-open");
						$(".modal-backdrop").remove();
					}
				});
		}

		async show_new() {
			$(window).off("resize.oppLineItemsWidth");
			this.closeListFilterUi();
			this.switchView("new");
			this.setTitle("New COF");
			console.log("Customer Order Forms UI:", OPP_UI_VERSION);
			this._newOppCurrentStep = 1;
			this._newOppItemWizardAutoOpened = false;
			this.bindDialogCloseFix();
			this.bindNewOpportunityForm();
			this.bindLineItemsFullWidth();
			this.initNewOpportunityDefaults();

			// Prefill customer when opened from Customers -> Connections (+)
			const urlParams = new URLSearchParams(window.location.search || "");
			const prefilledCustomer = (urlParams.get("customer") || "").trim();
			if (prefilledCustomer) {
				this.setNewOpportunityPartyName(prefilledCustomer);
			}

			await this.consumePendingQuotationFromOpportunity();

			this.gotoNewWizardStep(1);
		}

		async consumePendingQuotationFromOpportunity() {
			let payload = frappe._pendingQuotationFromOpportunity || null;

			if (!payload) {
				try {
					const raw = window.sessionStorage.getItem("customer_order_forms_pending_from_opportunity");
					if (raw) payload = JSON.parse(raw);
				} catch (e) {
					payload = null;
				}
			}

			if (!payload || typeof payload !== "object") {
				return false;
			}

			delete frappe._pendingQuotationFromOpportunity;
			try {
				window.sessionStorage.removeItem("customer_order_forms_pending_from_opportunity");
			} catch (e) {
				// no-op
			}

			const $scope = $(this.page.wrapper);
			const normalize = (value) => String(value || "").trim();

			const customer = normalize(payload.customer || payload.customer);
			const company = normalize(payload.company);
			const customerAddress = normalize(
				payload.customer_address
				|| payload.customer_address_name
				|| payload.billing_address_name
				|| payload.billing_address
				|| ""
			);
			const shippingAddress = normalize(payload.shipping_address_name);
			const addressDisplay = normalize(payload.address_display);
			const resolvedCustomerAddress = customerAddress || shippingAddress;
			const companyAddress = normalize(payload.company_address || payload.company_address_name);
			const transactionDate = this.normalizeDateForDoc(payload.transaction_date, "");
			const validTill = this.normalizeDateForDoc(payload.valid_till, "");
			const taxCategory = normalize(payload.tax_category);
			const taxesAndCharges = normalize(payload.taxes_and_charges);
			const paymentTermsTemplate = normalize(payload.payment_terms_template);
			const termsTemplate = normalize(payload.tc_name || payload.terms_template);
			const sourceOpportunity = normalize(payload.opportunity || payload.opportunity_name || payload.prevdoc_docname || payload.quotation_id || "");
			const sourceDoctype = normalize(payload.source_doctype || "Quotation");

			this._newOppPreserveFromOpportunityUntil = Date.now() + 2000;
			this._newOppSourceOpportunity = sourceOpportunity;
			this._newOppSourceDoctype = sourceDoctype;
			this._newOppGrandTotal = Number(payload.grand_total || 0) || 0;
			this._newOppInWords = String(payload.in_words || "").trim();
			this._newOppRoundedTotal = Number(payload.rounded_total || 0) || 0;

			if (customer) this.setNewOpportunityPartyName(customer);
			if (company) this.setNewOpportunityCompany(company);
			if (resolvedCustomerAddress) this.setNewOpportunityCustomerAddress(resolvedCustomerAddress);
			if (shippingAddress) this.setNewOpportunityShippingAddress(shippingAddress);
			if (companyAddress) this.setNewOpportunityCompanyAddress(companyAddress);
			if (taxCategory) this.setNewOpportunityTaxCategory(taxCategory);
			if (taxesAndCharges) this.setNewOpportunityTaxTemplate(taxesAndCharges);
			if (paymentTermsTemplate) this.setNewOpportunityPaymentTermsTemplate(paymentTermsTemplate);
			if (termsTemplate) this.setNewOpportunityTermsTemplate(termsTemplate);
			this.setNewOpportunityPoRefNumber(normalize(payload.po_ref_number || payload.po_no));
			this.setNewOpportunityPoAttachment(normalize(payload.custom_po_attachment || payload.customer_po));

			const subject = normalize(payload.custom_subject || payload.subject || "");
			if (subject) $scope.find("#new-opp-subject").val(subject);

			if (transactionDate) {
				$scope.find("#new-opp-transaction-date").val(transactionDate);
			}
			if (validTill) {
				$scope.find("#new-opp-valid-till").val(validTill);
				this._newOppValidTillManuallyChanged = true;
			}

			const contactRows = Array.isArray(payload.contact_list) ? payload.contact_list : [];
			const contactList = contactRows
				.map((row) => normalize(row?.contact || row?.contact_person || row?.contact_name || row?.party_contact || row?.user_name))
				.filter(Boolean);

			const primaryContact = normalize(payload.contact_person);
			if (primaryContact && !contactList.includes(primaryContact)) {
				contactList.unshift(primaryContact);
			}

			this._newOppContactMeta = this._newOppContactMeta || {};
			contactRows.forEach((row) => {
				const contactId = normalize(row?.contact || row?.contact_person || row?.contact_name || row?.party_contact || row?.user_name);
				if (!contactId) return;
				this._newOppContactMeta[contactId] = {
					...(this._newOppContactMeta[contactId] || {}),
					full_name: normalize(row?.full_name || row?.contact_name || row?.person_name),
					phone: normalize(row?.phone || row?.mobile_no || row?.contact_mobile || row?.phone_no),
					email: normalize(row?.email || row?.email_id || row?.contact_email),
					designation: normalize(row?.designation || row?.desgination),
					tpoc: Number(row?.tpoc || row?.is_tpoc || row?.is_primary_contact || row?.is_primary || 0) === 1 ? 1 : 0,
					_loaded: true,
				};
			});

			this._newOppContactList = contactList;
			this._newOppSelectedContact = primaryContact || contactList[0] || "";
			$scope.trigger("new-opp-contact-changed");

			let salesTeam = (Array.isArray(payload.sales_team) ? payload.sales_team : [])
				.map((row) => {
					const salesPerson = normalize(row?.sales_person || row?.sales_person_name);
					if (!salesPerson) return null;
					return {
						sales_person: salesPerson,
						mobile_no: normalize(row?.mobile_no || row?.mobile || row?.contact_mobile || row?.phone),
						email_id: normalize(row?.email_id || row?.email || row?.contact_email),
						allocated_percentage: Number(row?.allocated_percentage || row?.allocation_percentage || row?.allocated || 100) || 100,
					};
				})
				.filter(Boolean);

			if (!salesTeam.length && customer) {
				try {
					const customerDoc = await frappe.db.get_doc("Customer", customer);
					const customerSalesTeam = Array.isArray(customerDoc?.sales_team) ? customerDoc.sales_team : [];
					console.log("Fetched sales_team from customer:", customerSalesTeam);
					if (customerSalesTeam.length) {
						salesTeam = customerSalesTeam.map((row) => {
							const salesPerson = normalize(row?.sales_person || row?.sales_person_name);
							if (!salesPerson) return null;
							return {
								sales_person: salesPerson,
								mobile_no: normalize(row?.mobile_no || row?.mobile || row?.contact_mobile || row?.phone),
								email_id: normalize(row?.email_id || row?.email || row?.contact_email),
								allocated_percentage: Number(row?.allocated_percentage || row?.allocation_percentage || row?.allocated || 100) || 100,
							};
						}).filter(Boolean);
						console.log("Mapped salesTeam from customer:", salesTeam);
					}
				} catch (e) {
					console.warn("Failed to fetch sales_team from customer:", e);
				}
			}

			const pendingSourceOpportunity = normalize(payload.opportunity || payload.opportunity_name || payload.prevdoc_docname || payload.source_opportunity || "");
			const pendingSourceDoctype = normalize(payload.source_doctype || payload.doctype || "Quotation");

			if (!salesTeam.length && pendingSourceOpportunity) {
				try {
					if (pendingSourceDoctype === "Quotation") {
						const sourceDoc = await frappe.db.get_doc("Quotation", pendingSourceOpportunity);
						const sourceSales = Array.isArray(sourceDoc?.sales_team) ? sourceDoc.sales_team : [];
						if (sourceSales.length) {
							salesTeam = sourceSales.map((row) => {
								const salesPerson = normalize(row?.sales_person || row?.sales_person_name);
								if (!salesPerson) return null;
								return {
									sales_person: salesPerson,
									mobile_no: normalize(row?.mobile_no || row?.mobile || row?.contact_mobile || row?.phone),
									email_id: normalize(row?.email_id || row?.email || row?.contact_email),
									allocated_percentage: Number(row?.allocated_percentage || row?.allocation_percentage || row?.allocated || 100) || 100,
								};
							}).filter(Boolean);
						}
					}
					if (!salesTeam.length && pendingSourceDoctype === "Opportunity") {
						const oppDoc = await frappe.db.get_doc("Opportunity", pendingSourceOpportunity);
						const oppSales = Array.isArray(oppDoc?.sales_team) ? oppDoc.sales_team : [];
						if (oppSales.length) {
							salesTeam = oppSales.map((row) => {
								const salesPerson = normalize(row?.sales_person || row?.sales_person_name);
								if (!salesPerson) return null;
								return {
									sales_person: salesPerson,
									mobile_no: normalize(row?.mobile_no || row?.mobile || row?.contact_mobile || row?.phone),
									email_id: normalize(row?.email_id || row?.email || row?.contact_email),
									allocated_percentage: Number(row?.allocated_percentage || row?.allocation_percentage || row?.allocated || 100) || 100,
								};
							}).filter(Boolean);
						}
					}
				} catch (e) {
					console.warn("Failed to fetch sales team from source document:", e);
				}
			}

			console.log("Final salesTeam:", salesTeam);
			this.setNewOpportunitySalesTeam(salesTeam);

			// Render the inline sales-person display from the payload
			const firstSalesPerson = salesTeam[0];
			if (firstSalesPerson?.sales_person) {
				const safeName = frappe.utils.escape_html(firstSalesPerson.sales_person);
				const safeMobile = frappe.utils.escape_html(firstSalesPerson.mobile_no || "");
				const safeEmail = frappe.utils.escape_html(firstSalesPerson.email_id || "");
				const $spDisplay = $scope.find("#new-opp-sales-person-display");
				if ($spDisplay.length) {
					$spDisplay.html(`
					<div class="new-opp-contact-entry" data-sales-person-inline="${safeName}">
						<div class="new-opp-contact-entry-top">
							<span class="new-opp-contact-entry-name" title="${safeName}">
								<span class="new-opp-sales-person-name-toggle">${safeName}</span>
							</span>
						</div>
						<div class="new-opp-contact-entry-details d-none">
							${safeMobile ? `<div class="new-opp-contact-entry-meta" title="${safeMobile}">${safeMobile}</div>` : ""}
							${safeEmail ? `<div class="new-opp-contact-entry-meta" title="${safeEmail}">${safeEmail}</div>` : ""}
							${!safeMobile && !safeEmail ? `<div class="new-opp-contact-entry-meta text-muted">No details</div>` : ""}
						</div>
					</div>
				`);
				}
				if (this._newOppSalesPersonControl?.set_value) {
					this._newOppSalesPersonControl.set_value(firstSalesPerson.sales_person);
				}
			}

			// Pre-fill Quotation ID field
			const quotationIdValue = normalize(payload.quotation_id || payload.opportunity || "");
			if (quotationIdValue) $scope.find("#new-opp-quotation-id").val(quotationIdValue);

			const items = Array.isArray(payload.items) ? payload.items : [];
			if (typeof this._addNewOppItemRow === "function") {
				$scope.find("#new-opp-items-table-body").html("");
				items.forEach((row) => {
					const qty = Number(row?.qty || 1) || 1;
					const rate = Number(row?.rate || 0) || 0;
					const amount = Number(row?.amount || (qty * rate)) || 0;

					this._addNewOppItemRow({
						item_code: normalize(row?.item_code),
						item_name: normalize(row?.item_name),
						qty,
						rate,
						amount,
						brand: normalize(row?.brand),
						item_group: normalize(row?.item_group),
						description: normalize(row?.description),
						hsncode: normalize(row?.hsncode || row?.hsn_code || row?.gst_hsn_code),
						uom: normalize(row?.uom || row?.stock_uom),
						opportunity_type: normalize(row?.opportunity_type || row?.custom_opportunity_type || "New") || "New",
						renewal_id: normalize(row?.renewal_id),
						orc: Number(row?.orc || 0) ? 1 : 0,
						commission_type: normalize(row?.commission_type),
						rate_value: Number(row?.rate_value || 0) || 0,
					});
				});
				$scope.trigger("new-opp-items-visibility-refresh");
			}

			setTimeout(async () => {
				const currentCustomer = normalize(this.getNewOpportunityPartyName());
				const currentCompany = normalize(this.getNewOpportunityCompany());

				if (!this.getNewOpportunityShippingAddress() && currentCustomer) {
					try {
						const customerDoc = await frappe.db.get_doc("Customer", currentCustomer);
						const fallbackShipping = normalize(
							customerDoc?.shipping_address_name
							|| customerDoc?.shipping_address
							|| customerDoc?.customer_primary_address
							|| customerDoc?.primary_address
							|| customerDoc?.customer_address
						);
						if (fallbackShipping) {
							this.setNewOpportunityShippingAddress(fallbackShipping);
						}
					} catch (e) {
						// no-op
					}
				}

				if (!this.getNewOpportunityCompanyAddress() && currentCompany) {
					try {
						const companyDoc = await frappe.db.get_doc("Company", currentCompany);
						let fallbackCompanyAddress = normalize(companyDoc?.company_address || companyDoc?.default_address);

						if (!fallbackCompanyAddress) {
							const defaultAddressRes = await frappe.call({
								method: "frappe.contacts.doctype.address.address.get_default_address",
								args: { doctype: "Company", name: currentCompany },
							});
							fallbackCompanyAddress = normalize(
								defaultAddressRes?.message?.name
								|| defaultAddressRes?.message?.address
								|| defaultAddressRes?.message
							);
						}

						if (!fallbackCompanyAddress) {
							const linkedRows = await frappe.db.get_list("Dynamic Link", {
								fields: ["parent", "parenttype"],
								filters: {
									link_doctype: "Company",
									link_name: currentCompany,
									parenttype: "Address",
								},
								limit: 10,
							});
							fallbackCompanyAddress = normalize(linkedRows?.[0]?.parent);
						}

						if (fallbackCompanyAddress) {
							this.setNewOpportunityCompanyAddress(fallbackCompanyAddress);
						}
					} catch (e) {
						// no-op
					}
				}

				if (!this.getNewOpportunityPaymentTermsTemplate() && typeof this._runNewOppPaymentTermsPrefill === "function") {
					try {
						await this._runNewOppPaymentTermsPrefill();
					} catch (e) {
						// no-op
					}
				}

				if ((!this.getNewOpportunityTaxCategory() || !this.getNewOpportunityTaxTemplate()) && typeof this._runNewOppTaxDefaults === "function") {
					try {
						await this._runNewOppTaxDefaults();
					} catch (e) {
						// no-op
					}
				}

				if (typeof this._renderNewOppTaxesPreview === "function") {
					this._renderNewOppTaxesPreview();
				}
				if (typeof this._renderNewOppPaymentTermsPreview === "function") {
					this._renderNewOppPaymentTermsPreview();
				}

				$scope.trigger("new-opp-contact-changed");
			}, 2200);

			return true;
		}

		gotoNewWizardStep(step) {
			const $scope = $(this.page.wrapper);
			const totalSteps = 5;
			this._newOppCurrentStep = step;

			// Update stepper bar
			$scope.find(".new-opp-wizard-step").each(function () {
				const s = parseInt($(this).data("step"), 10);
				$(this).removeClass("is-active is-done");
				if (s < step) $(this).addClass("is-done");
				else if (s === step) $(this).addClass("is-active");
			});

			// Update connector lines
			$scope.find(".new-opp-wizard-connector").each(function (idx) {
				$(this).toggleClass("is-done", idx + 1 < step);
			});

			// Show/hide panels
			$scope.find(".new-opp-wizard-panel").each(function () {
				const p = parseInt($(this).data("panel"), 10);
				$(this).toggleClass("d-none", p !== step);
			});

			// Back button
			$scope.find("#new-opp-back").toggleClass("d-none", step === 1);

			// Next vs Save button
			const isLastStep = step === totalSteps;
			$scope.find("#new-opp-next").toggleClass("d-none", isLastStep);
			$scope.find("#new-opp-save").toggleClass("d-none", !isLastStep);

			// Ensure item row on step 3 (Items)
			if (step === 3) {
				$scope.trigger("new-opp-items-visibility-refresh");
			}

			// Re-initialize link controls when step 5 (Terms) becomes visible,
			// because Frappe link controls don't render properly inside d-none panels.
			if (step === 5) {
				setTimeout(() => this.ensureNewOpportunityControls(), 50);
			}
		}

		bindNewOpportunityForm() {
			const me = this;
			const $scope = $(this.page.wrapper);

			this.ensureNewOpportunityControls();

			const addContactValue = (value = "") => {
				const contactValue = String(value || "").trim();
				if (!contactValue) return;
				me._newOppContactList = Array.isArray(me._newOppContactList) ? me._newOppContactList : [];
				if (!me._newOppContactList.includes(contactValue)) {
					me._newOppContactList.push(contactValue);
				}
			};

			const removeContactValue = (value = "") => {
				const contactValue = String(value || "").trim();
				if (!contactValue) return;
				me._newOppContactList = (Array.isArray(me._newOppContactList) ? me._newOppContactList : [])
					.filter((entry) => String(entry || "").trim() !== contactValue);
			};

			const getRowItemCode = ($row) => {
				const itemCodeControl = $row.data("itemCodeControl");
				return String((itemCodeControl?.get_value?.() || $row.find(".new-opp-item-code").val() || "")).trim();
			};

			const getRowRenewalId = ($row) => {
				const renewalIdControl = $row.data("renewalIdControl");
				return String((renewalIdControl?.get_value?.() || $row.find(".new-opp-item-renewal-id").val() || "")).trim();
			};

			const parseNumber = (value) => {
				return parseFloat(String(value ?? "").replace(/,/g, "")) || 0;
			};

			const toPlainText = (value) => {
				const raw = String(value ?? "");
				if (!raw) return "";

				const $root = $("<div>").html(raw);
				$root.find("br").replaceWith("\n");
				$root.find("li").each(function () {
					const text = $(this).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
					$(this).replaceWith(text ? `\n• ${text}` : "");
				});
				$root.find("p, div, section, article, tr").each(function () {
					if ($(this).find("li").length) return;
					$(this).append("\n");
				});

				return $root
					.text()
					.replace(/\u00a0/g, " ")
					.replace(/[ \t]+\n/g, "\n")
					.replace(/\n[ \t]+/g, "\n")
					.replace(/\n{3,}/g, "\n\n")
					.trim();
			};

			const getDescriptionPreviewText = (value, maxLength = 180) => {
				const text = String(value || "").trim();
				if (!text) return "No description";
				if (text.length <= maxLength) return text;
				return `${text.slice(0, maxLength).trimEnd()}...`;
			};

			const getRenewalDoctype = async () => {
				if (Object.prototype.hasOwnProperty.call(me, "_newOppRenewalDoctype")) {
					return me._newOppRenewalDoctype;
				}

				me._newOppRenewalDoctype = "";
				try {
					await frappe.model.with_doctype("Opportunity Item");
					const renewalDf = frappe.meta.get_docfield("Opportunity Item", "renewal_id");
					me._newOppRenewalDoctype = String(renewalDf?.options || "").trim();
				} catch (e) {
					me._newOppRenewalDoctype = "";
				}

				const tryDoctypes = [me._newOppRenewalDoctype, "Renewal List", "Renewal"]
					.map((value) => String(value || "").trim())
					.filter((value, idx, arr) => value && arr.indexOf(value) === idx);

				for (const doctypeName of tryDoctypes) {
					try {
						await frappe.model.with_doctype(doctypeName);
						me._newOppRenewalDoctype = doctypeName;
						break;
					} catch (e) {
						// try next doctype candidate
					}
				}

				return me._newOppRenewalDoctype;
			};

			const getRenewalCustomerFilterField = async () => {
				if (Object.prototype.hasOwnProperty.call(me, "_newOppRenewalCustomerFilterField")) {
					return me._newOppRenewalCustomerFilterField;
				}

				me._newOppRenewalCustomerFilterField = "";
				const renewalDoctype = await getRenewalDoctype();
				if (!renewalDoctype) return "";

				try {
					await frappe.model.with_doctype(renewalDoctype);
					const renewalMeta = frappe.get_meta(renewalDoctype);
					const candidates = ["customer", "customer", "customer_name"];
					me._newOppRenewalCustomerFilterField = candidates.find((fieldname) =>
						renewalMeta?.fields?.some((df) => df.fieldname === fieldname)
					) || "";
				} catch (e) {
					me._newOppRenewalCustomerFilterField = "";
				}

				return me._newOppRenewalCustomerFilterField;
			};

			const getRowDataSnapshot = ($row) => {
				return {
					item_code: getRowItemCode($row),
					item_name: String($row.find(".new-opp-item-name").val() || "").trim(),
					rate: parseNumber($row.find(".new-opp-item-rate").val()),
					qty: parseNumber($row.find(".new-opp-item-qty").val()),
					amount: parseNumber($row.find(".new-opp-item-amount").val()),
					brand: String($row.find(".new-opp-item-brand").val() || "").trim(),
					item_group: String($row.find(".new-opp-item-group").val() || "").trim(),
					description: String($row.find(".new-opp-item-description").val() || "").trim(),
					hsncode: String($row.find(".new-opp-item-hsncode").val() || "").trim(),
					uom: String($row.find(".new-opp-item-uom").val() || "").trim(),
					opportunity_type: String($row.find(".new-opp-item-opportunity-type").val() || "").trim(),
					renewal_id: getRowRenewalId($row),
					orc: $row.find(".new-opp-item-orc").is(":checked") ? 1 : 0,
					commission_type: String($row.find(".new-opp-item-commission-type").val() || "").trim(),
					rate_value: parseFloat($row.find(".new-opp-item-rate-value").val() || "0") || 0,
				};
			};

			const getInlineItemDetailFields = ($row) => {
				const baseValues = getRowDataSnapshot($row);
				const sourceValues = { ...($row.data("sourceItemFields") || {}) };
				const extraValues = { ...($row.data("extraItemFields") || {}) };
				const merged = { ...sourceValues, ...baseValues, ...extraValues };

				const labels = {
					qty: "Qty",
					rate: "Rate",
					amount: "Amount",
					brand: "Brand",
					item_group: "Item Group",
					description: "Description",
					hsncode: "HSN Code",
					uom: "UOM",
					opportunity_type: "Opportunity Type",
					renewal_id: "Renewal ID",
					orc: "ORC",
					commission_type: "Commission Type",
					rate_value: "Rate Value",
				};

				const preferredOrder = [
					"qty", "rate", "amount", "uom",
					"brand", "item_group", "hsncode", "opportunity_type",
					"renewal_id", "orc", "commission_type", "rate_value", "description",
				];

				const keysInOrder = [
					...preferredOrder.filter((fieldname) => Object.prototype.hasOwnProperty.call(merged, fieldname)),
					...Object.keys(merged).filter((fieldname) => !preferredOrder.includes(fieldname) && fieldname !== "item_code" && fieldname !== "item_name" && fieldname !== "_extra_fields"),
				];

				const formatValue = (fieldname, value) => {
					if (value == null) return "";
					if (fieldname === "orc") return Number(value) === 1 ? "Yes" : "No";
					if (["qty", "rate", "amount", "rate_value"].includes(fieldname)) {
						const num = Number(value);
						return Number.isFinite(num) ? String(num) : "";
					}
					return String(value).trim();
				};

				return keysInOrder
					.map((fieldname) => {
						const displayValue = formatValue(fieldname, merged[fieldname]);
						if (!displayValue) return null;
						return {
							fieldname,
							label: labels[fieldname] || frappe.model.unscrub(fieldname),
							value: displayValue,
						};
					})
					.filter(Boolean);
			};

			const renderInlineItemDetails = ($row, expand = false) => {
				const detailFields = getInlineItemDetailFields($row);
				const $existingRow = $row.next(".new-opp-item-inline-details");
				const $tableSummary = $row.find(".new-opp-item-table-summary");

				if ($tableSummary.length) {
					$tableSummary.text("").addClass("d-none");
				}

				if (!expand) {
					if ($existingRow.length) $existingRow.remove();
					return;
				}

				if (!detailFields.length) {
					if ($existingRow.length) $existingRow.remove();
					return;
				}

				const detailsHtml = detailFields
					.map((entry) => {
						const safeLabel = frappe.utils.escape_html(String(entry.label || "").trim());
						const safeValue = frappe.utils.escape_html(String(entry.value || "").trim());
						return `
						<div class="new-opp-item-detail-pill">
							<span class="text-muted">${safeLabel}:</span>
							<span>${safeValue}</span>
						</div>
					`;
					})
					.join("");

				if ($existingRow.length) {
					$existingRow.find(".new-opp-item-inline-details-wrap").html(detailsHtml);
					$existingRow.toggleClass("d-none", !expand);
					return;
				}

				const detailsRow = `
				<tr class="new-opp-item-inline-details ${expand ? "" : "d-none"}">
					<td colspan="9">
						<div class="new-opp-item-inline-details-wrap">${detailsHtml}</div>
					</td>
				</tr>
			`;
				$row.after(detailsRow);
			};

			const syncNewOppMainRowDisplay = ($row) => {
				// Recover from older buggy state where first cell was accidentally hidden.
				$row.children("td").first().show();

				const canonicalValues = { ...($row.data("currentItemValues") || {}) };
				const manualValues = { ...($row.data("manualItemValues") || {}) };
				const stored = {
					...($row.data("sourceItemFields") || {}),
					...($row.data("extraItemFields") || {}),
					...canonicalValues,
					...manualValues,
				};
				const sanitizeText = (value) => {
					const raw = String(value || "");
					if (!raw) return "";
					return frappe.utils.strip_html
						? String(frappe.utils.strip_html(raw) || "").trim()
						: $("<div>").html(raw).text().trim();
				};
				const pickText = (selector, fallbackKey = "") => {
					// Use canonical value only when it is non-empty
					const canonVal = String(canonicalValues[fallbackKey] ?? "");
					if (canonVal) return sanitizeText(canonVal);
					// Fall back to hidden input in main row
					const $field = $row.find(selector);
					const current = String($field.val() || "").trim();
					if (current) return sanitizeText(current);
					// Last resort: stored merged data
					return sanitizeText(stored[fallbackKey]);
				};
				const pickNumber = (selector, fallbackKey = "") => {
					const manualVal = manualValues[fallbackKey];
					if (manualVal !== undefined && manualVal !== null && manualVal !== "") {
						return parseNumber(manualVal);
					}
					const $field = $row.find(selector);
					const current = String($field.val() || "").trim();
					// Prefer the hidden row input first because Apply writes latest values there.
					if (current !== "") return parseNumber(current);
					// Fall back to canonical cache only when row input is empty.
					const canonVal = canonicalValues[fallbackKey];
					if (canonVal !== undefined && canonVal !== null && canonVal !== "") {
						return parseNumber(canonVal);
					}
					return parseNumber(stored[fallbackKey]);
				};

				const itemCodeControl = $row.data("itemCodeControl");
				const itemCode = sanitizeText(itemCodeControl?.get_value?.() || $row.find(".new-opp-item-code").val() || stored.item_code || "");
				const itemName = pickText(".new-opp-item-name", "item_name") || itemCode || "-";
				const qty = pickNumber(".new-opp-item-qty", "qty");
				const rate = pickNumber(".new-opp-item-rate", "rate");
				const amount = pickNumber(".new-opp-item-amount", "amount") || (qty * rate);
				const brand = pickText(".new-opp-item-brand", "brand");
				const opportunityType = pickText(".new-opp-item-opportunity-type", "opportunity_type");
				const renewalId = getRowRenewalId($row) || String(stored.renewal_id || "").trim();
				const isOrc = $row.find(".new-opp-item-orc").is(":checked") || Number(stored.orc || 0) === 1;
				const commissionType = pickText(".new-opp-item-commission-type", "commission_type");
				const rateValue = pickText(".new-opp-item-rate-value", "rate_value");

				$row.find(".new-opp-display-item-name").text(itemName).attr("title", itemName);
				$row.find(".new-opp-display-item-code-sub").text(itemCode || "").attr("title", itemCode || "");
				$row.find(".new-opp-display-brand").text(brand || "Others").attr("title", brand || "Others");
				$row.find(".new-opp-display-qty").text(fmtInt(qty));
				$row.find(".new-opp-display-rate").text(fmtCurrency(rate || 0));
				$row.find(".new-opp-display-amount").text(fmtCurrency(amount || 0));
				$row.find(".new-opp-display-opportunity-type").text(opportunityType || "-").attr("title", opportunityType || "-");
				$row.find(".new-opp-display-renewal-id").text(renewalId || "-").attr("title", renewalId || "-");
				$row.find(".new-opp-display-orc").text(isOrc ? "✓" : "-");
				$row.find(".new-opp-display-commission-type").text(isOrc ? (commissionType || "-") : "-");
				$row.find(".new-opp-display-rate-value").text(isOrc ? (rateValue || "-") : "-");
			};

			const toggleOrcDependentFields = ($row, preserveValues = false) => {
				const isOrcEnabled = $row.find(".new-opp-item-orc").is(":checked");
				const $commissionTypeCell = $row.find(".new-opp-display-commission-type").closest("td");
				const $rateValueCell = $row.find(".new-opp-display-rate-value").closest("td");

				$commissionTypeCell.toggle(isOrcEnabled);
				$rateValueCell.toggle(isOrcEnabled);

				if (!isOrcEnabled && !preserveValues) {
					$row.find(".new-opp-item-commission-type").val("");
					$row.find(".new-opp-item-rate-value").val("");
				}

				updateOrcDependentColumnVisibility();
			};

			const updateOrcDependentColumnVisibility = () => {
				const $table = $scope.find("#new-opp-items-table-body").closest("table");
				if (!$table.length) return;

				const hasOrcEnabledRow = $scope
					.find("#new-opp-items-table-body .new-opp-item-orc")
					.toArray()
					.some((el) => $(el).is(":checked"));

				$table.find("thead th:nth-child(15), thead th:nth-child(16), tbody td:nth-child(15), tbody td:nth-child(16)").toggle(hasOrcEnabledRow);
			};

			const refreshNewOppItemsVisibility = () => {
				const rowCount = $scope.find("#new-opp-items-table-body tr.new-opp-item-main-row").length;
				const hasItems = rowCount > 0;
				$scope.find("#new-opp-items-empty-state").toggleClass("d-none", hasItems);
				$scope.find("#new-opp-items-table-wrap").toggleClass("d-none", !hasItems);
				$scope.find("#new-opp-add-item-actions").toggleClass("d-none", !hasItems);
				$scope.find("#new-opp-add-first-item").toggleClass("d-none", hasItems);
			};

			const removeItemMainRow = ($mainRow) => {
				if (!$mainRow?.length) return;
				let $sibling = $mainRow.next();
				while ($sibling.length && ($sibling.hasClass("new-opp-item-inline-details") || $sibling.hasClass("new-opp-item-inline-editor"))) {
					const $toRemove = $sibling;
					$sibling = $sibling.next();
					$toRemove.remove();
				}
				$mainRow.remove();
				updateOrcDependentColumnVisibility();
				refreshNewOppItemsVisibility();
			};

			const addItemRow = async (row = {}) => {
				const itemCode = frappe.utils.escape_html(String(row.item_code || ""));
				const itemName = frappe.utils.escape_html(String(row.item_name || ""));
				const qty = Number(row.qty || 1);
				const rate = Number(row.rate || 0);
				const amount = Number(row.amount || (qty * rate));
				const brand = frappe.utils.escape_html(String(row.brand || ""));
				const itemGroup = frappe.utils.escape_html(String(row.item_group || ""));
				const description = frappe.utils.escape_html(toPlainText(row.description || ""));
				const hsncode = frappe.utils.escape_html(String(row.hsncode || row.hsn_code || row.gst_hsn_code || ""));
				const uom = frappe.utils.escape_html(String(row.uom || ""));
				const opportunityType = String(row.opportunity_type || row.custom_opportunity_type || "New").trim() || "New";
				const renewalId = frappe.utils.escape_html(String(row.renewal_id || ""));
				const orc = Number(row.orc || 0) ? "checked" : "";
				const commissionType = String(row.commission_type || "").trim();
				const rateValue = frappe.utils.escape_html(String(row.rate_value || ""));

				const opportunityTypeOptions = ["", "New", "Renewal", "Additional", "Add-on"]
					.map((value) => `<option value="${frappe.utils.escape_html(value)}" ${value === opportunityType ? "selected" : ""}>${value || "Select"}</option>`)
					.join("");

				const commissionTypeOptions = ["", "Unit Rate", "Value"]
					.map((value) => `<option value="${frappe.utils.escape_html(value)}" ${value === commissionType ? "selected" : ""}>${value || "Select"}</option>`)
					.join("");

				const tr = `
				<tr class="new-opp-item-main-row">
					<td>
						<div class="line-item-title">
							<div class="name new-opp-display-item-name" title="${itemName}">${itemName || "-"}</div>
							<div class="sub new-opp-display-item-code-sub" title="${itemCode}">${itemCode}</div>
						</div>
						<div class="new-opp-item-code-link-control d-none"></div>
						<div class="d-none new-opp-item-hidden-fields">
							<input type="hidden" class="new-opp-item-code" value="${itemCode}">
							<input type="hidden" class="new-opp-item-name" value="${itemName}" />
							<input type="hidden" class="new-opp-item-brand" value="${brand}" />
							<input type="hidden" class="new-opp-item-qty" value="${qty}">
							<input type="hidden" class="new-opp-item-rate" value="${rate}">
							<input type="hidden" class="new-opp-item-amount" value="${amount}">
							<input type="hidden" class="new-opp-item-opportunity-type" value="${frappe.utils.escape_html(opportunityType)}">
							<input type="hidden" class="new-opp-item-renewal-id" value="${renewalId}">
							<input type="checkbox" class="new-opp-item-orc d-none" ${orc}>
							<input type="hidden" class="new-opp-item-commission-type" value="${frappe.utils.escape_html(commissionType)}">
							<input type="hidden" class="new-opp-item-rate-value" value="${rateValue}">
							<input type="hidden" class="new-opp-item-group" value="${itemGroup}" />
							<input type="hidden" class="new-opp-item-description" value="${description}" />
							<input type="hidden" class="new-opp-item-hsncode" value="${hsncode}" />
							<input type="hidden" class="new-opp-item-uom" value="${uom}" />
						</div>
						<div class="new-opp-item-table-summary text-muted d-none" style="margin-top: 4px; font-size: 12px;"></div>
					</td>
					<td class="line-items-center"><span class="new-opp-display-qty">${fmtInt(qty)}</span></td>
					<td class="line-items-center"><span class="new-opp-display-rate">${fmtCurrency(rate)}</span></td>
					<td class="line-items-center"><span class="new-opp-display-amount">${fmtCurrency(amount)}</span></td>
					<td class="actions-col line-items-center">
						<button type="button" class="item-row-edit-btn new-opp-edit-row" title="Edit this item"><i class="fa fa-pencil"></i></button>
						<button type="button" class="item-row-delete-btn new-opp-delete-row" title="Delete this item" style="margin-left:4px;">
							<i class="fa fa-trash" style="color:#e74c3c;"></i>
						</button>
					</td>
				</tr>
			`;
				const $tbody = $scope.find("#new-opp-items-table-body");
				$tbody.append(tr);
				const $row = $tbody.find("tr").last();
				$row.data("sourceItemFields", { ...row });
				$row.data("extraItemFields", row._extra_fields || row.extra_fields || {});
				$row.data("_autofillLockedUntil", Date.now() + 1500);
				$row.data("currentItemValues", {
					item_code: String(row.item_code || "").trim(),
					item_name: String(row.item_name || "").trim(),
					qty,
					rate,
					amount,
					brand: String(row.brand || "").trim(),
					item_group: String(row.item_group || "").trim(),
					description: String(row.description || "").trim(),
					hsncode: String(row.hsncode || row.hsn_code || row.gst_hsn_code || "").trim(),
					uom: String(row.uom || "").trim(),
					opportunity_type: opportunityType,
					renewal_id: String(row.renewal_id || "").trim(),
					orc: Number(row.orc || 0) ? 1 : 0,
					commission_type: String(row.commission_type || "").trim(),
					rate_value: String(row.rate_value || "").trim(),
				});
				syncNewOppMainRowDisplay($row);

				if (frappe?.ui?.form?.make_control) {
					const $holder = $row.find(".new-opp-item-code-link-control");
					if ($holder.length) {
						$row.data("_skipNextItemAutofill", true);
						const itemCodeControl = frappe.ui.form.make_control({
							parent: $holder,
							df: {
								fieldtype: "Link",
								fieldname: "item_code",
								options: "Item",
								label: "",
								placeholder: __("Item code"),
								get_query: () => ({
									filters: { disabled: 0 },
								}),
								onchange: async () => {
									if ($row.data("_skipNextItemAutofill")) {
										$row.removeData("_skipNextItemAutofill");
										return;
									}
									if ($row.data("_suppressItemAutofill")) return;
									await autofillItemRowByCode($row);
								},
							},
							render_input: true,
						});

						$row.data("_suppressItemAutofill", true);
						itemCodeControl.set_value(String(row.item_code || "").trim());
						setTimeout(() => {
							$row.removeData("_suppressItemAutofill");
						}, 500);
						$row.data("itemCodeControl", itemCodeControl);
						this.configureItemAdvancedSearch(itemCodeControl);
						this.attachInlineLinkPortal(itemCodeControl);
					}

					const $renewalHolder = $row.find(".new-opp-item-renewal-link-control");
					if ($renewalHolder.length) {
						const renewalDoctype = (await getRenewalDoctype()) || "Renewal List";
						const customerFilterField = await getRenewalCustomerFilterField();

						const renewalIdControl = frappe.ui.form.make_control({
							parent: $renewalHolder,
							df: {
								fieldtype: "Link",
								fieldname: "renewal_id",
								options: renewalDoctype,
								label: "",
								placeholder: __("Renewal ID"),
								get_query: () => {
									const customerName = String(me.getNewOpportunityPartyName() || "").trim();
									if (!customerName || !customerFilterField) {
										return {};
									}
									return {
										filters: {
											[customerFilterField]: customerName,
										},
									};
								},
							},
							render_input: true,
						});

						renewalIdControl.set_value(String(row.renewal_id || "").trim());
						renewalIdControl.$input?.addClass("new-opp-item-renewal-id");
						$row.data("renewalIdControl", renewalIdControl);
						this.attachInlineLinkPortal(renewalIdControl);
					}
				}

				toggleOrcDependentFields($row, true);
				renderInlineItemDetails($row, false);

				// For new blank rows, open editor immediately so first fields are visible.
				const hasInitialItem = String(row.item_code || row.item_name || "").trim();
				if (!hasInitialItem) {
					setTimeout(() => {
						$row.find(".new-opp-edit-row").trigger("click");
					}, 0);
				}

				me._newOppItemWizardAutoOpened = true;
				refreshNewOppItemsVisibility();

			};

			this._addNewOppItemRow = addItemRow;

			const recalcItemAmount = ($row) => {
				const qty = parseNumber($row.find(".new-opp-item-qty").val());
				const rate = parseNumber($row.find(".new-opp-item-rate").val());
				const amount = qty * rate;
				$row.find(".new-opp-item-amount").val(amount.toFixed(2));
			};

			const autofillItemRowByCode = async ($row, codeValue = "") => {
				const lockUntil = Number($row?.data("_autofillLockedUntil") || 0);
				if (lockUntil && Date.now() < lockUntil) return;
				if ($row?.data("_suppressItemAutofill")) return;

				const itemCode = String(codeValue || getRowItemCode($row) || "").trim();
				if (!itemCode) return;

				const itemMeta = await me.getItemAutofill(itemCode);
				if (!itemMeta) return;

				const setValue = (selector, value) => {
					const $field = $row.find(selector);
					if (!$field.length) return;
					$field.val(value || "");
				};

				setValue(".new-opp-item-name", itemMeta.item_name || "");
				setValue(".new-opp-item-description", toPlainText(itemMeta.description || ""));
				setValue(".new-opp-item-brand", itemMeta.brand || "");
				setValue(".new-opp-item-group", itemMeta.item_group || "");
				setValue(".new-opp-item-uom", itemMeta.uom || "");
				setValue(".new-opp-item-hsncode", itemMeta.hsncode || "");

				$row.find(".new-opp-item-rate").val(Number(itemMeta.rate || 0));
				$row.data("currentItemValues", {
					...($row.data("currentItemValues") || {}),
					item_code: itemCode,
					item_name: String(itemMeta.item_name || "").trim(),
					brand: String(itemMeta.brand || "").trim(),
					item_group: String(itemMeta.item_group || "").trim(),
					description: String(toPlainText(itemMeta.description || "") || "").trim(),
					uom: String(itemMeta.uom || "").trim(),
					hsncode: String(itemMeta.hsncode || "").trim(),
					rate: Number(itemMeta.rate || 0),
				});

				recalcItemAmount($row);
				syncNewOppMainRowDisplay($row);
			};

			const pickRenewalPresetForNew = async (opportunityType = "Renewal") => {
				const customerName = String(me.getNewOpportunityPartyName() || "").trim();
				if (!customerName) {
					frappe.msgprint(__("Please select a Customer first."));
					return null;
				}
				return await me.pickRenewalPresetItem(opportunityType, customerName);
			};

			const openDatePicker = (inputEl) => {
				if (!inputEl || inputEl.disabled || inputEl.readOnly) return;
				try {
					if (typeof inputEl.showPicker === "function") {
						inputEl.showPicker();
						return;
					}
				} catch (e) {
					// no-op fallback below
				}

				try {
					inputEl.focus();
				} catch (e) {
					// no-op
				}
			};

			me._newOppContactMeta = me._newOppContactMeta || {};
			me._newOppContactPhoneReq = me._newOppContactPhoneReq || {};
			me._newOppContactExpanded = me._newOppContactExpanded || {};
			me._newOppContactList = Array.isArray(me._newOppContactList) ? me._newOppContactList : [];

			const resolveSalesPersonContact = async (salesPersonName = "", seed = {}) => {
				const salesPersonValue = String(salesPersonName || "").trim();
				if (!salesPersonValue) {
					return { mobile_no: "", email_id: "" };
				}

				let mobileNo = String(seed?.mobile_no || seed?.mobile || seed?.contact_mobile || "").trim();
				let emailId = String(seed?.email_id || seed?.email || seed?.contact_email || "").trim();
				let employeeId = String(seed?.employee || seed?.employee_id || "").trim();
				let userId = String(seed?.user_id || seed?.user || "").trim();

				try {
					const salesRes = await frappe.db.get_value(
						"Sales Person",
						salesPersonValue,
						["employee"]
					);
					const salesMsg = salesRes?.message || {};
					if (!employeeId) {
						employeeId = String(salesMsg.employee || "").trim();
					}
				} catch (e) {
					// no-op
				}

				if ((!mobileNo || !emailId) && !employeeId) {
					try {
						const employeeRows = await frappe.db.get_list("Employee", {
							fields: ["name", "cell_number", "company_email", "personal_email", "user_id"],
							filters: { employee_name: salesPersonValue },
							limit: 1,
						});
						const employeeRow = Array.isArray(employeeRows) ? employeeRows[0] : null;
						if (employeeRow) {
							employeeId = String(employeeRow.name || "").trim();
							if (!mobileNo) {
								mobileNo = String(employeeRow.cell_number || "").trim();
							}
							if (!emailId) {
								emailId = String(employeeRow.company_email || employeeRow.personal_email || "").trim();
							}
							if (!userId) {
								userId = String(employeeRow.user_id || "").trim();
							}
						}
					} catch (e) {
						// no-op
					}
				}

				if ((!mobileNo || !emailId) && employeeId) {
					try {
						const employeeRes = await frappe.db.get_value(
							"Employee",
							employeeId,
							["cell_number", "personal_email", "company_email", "user_id"]
						);
						const employeeMsg = employeeRes?.message || {};
						if (!mobileNo) {
							mobileNo = String(employeeMsg.cell_number || "").trim();
						}
						if (!emailId) {
							emailId = String(employeeMsg.company_email || employeeMsg.personal_email || "").trim();
						}
						if (!userId) {
							userId = String(employeeMsg.user_id || "").trim();
						}
					} catch (e) {
						// no-op
					}
				}

				if (!userId && salesPersonValue.includes("@")) {
					userId = salesPersonValue;
				}

				if ((!mobileNo || !emailId) && userId) {
					try {
						const userRes = await frappe.db.get_value(
							"User",
							userId,
							["mobile_no", "phone", "email", "name"]
						);
						const userMsg = userRes?.message || {};
						if (!mobileNo) {
							mobileNo = String(userMsg.mobile_no || userMsg.phone || "").trim();
						}
						if (!emailId) {
							emailId = String(userMsg.email || userMsg.name || "").trim();
						}
					} catch (e) {
						// no-op
					}
				}

				return {
					mobile_no: mobileNo,
					email_id: emailId,
				};
			};

			const prefillSalesTeamFromCustomer = async () => {
				if (Date.now() < Number(me._newOppPreserveFromOpportunityUntil || 0)) {
					return;
				}
				me._newOppSalesPrefillReq = Number(me._newOppSalesPrefillReq || 0) + 1;
				const requestId = me._newOppSalesPrefillReq;

				const customerName = String(me.getNewOpportunityPartyName() || "").trim();
				if (!customerName) {
					me.setNewOpportunitySalesTeam([]);
					if (me._newOppSalesPersonControl?.set_value) {
						me._newOppSalesPersonControl.set_value("");
					}
					$(me.page.wrapper).find("#new-opp-sales-person-display").html("");
					return;
				}

				try {
					const customerDoc = await frappe.db.get_doc("Customer", customerName);
					if (requestId !== me._newOppSalesPrefillReq) return;
					if (String(me.getNewOpportunityPartyName() || "").trim() !== customerName) return;

					const rows = Array.isArray(customerDoc?.sales_team) ? customerDoc.sales_team : [];
					const salesPeople = rows
						.map((row) => {
							const salesPerson = String(row?.sales_person || "").trim();
							if (!salesPerson) return null;

							return {
								sales_person: salesPerson,
								mobile_no: String(row?.mobile_no || row?.mobile || row?.contact_mobile || "").trim(),
								email_id: String(row?.email_id || row?.email || row?.contact_email || "").trim(),
								employee: String(row?.employee || row?.employee_id || "").trim(),
								user_id: String(row?.user_id || row?.user || "").trim(),
								allocated_percentage: 100,
							};
						})
						.filter(Boolean);

					await Promise.all(
						salesPeople.map(async (entry) => {
							if (entry.mobile_no && entry.email_id) return;
							const resolved = await resolveSalesPersonContact(entry.sales_person, entry);
							entry.mobile_no = String(entry.mobile_no || resolved.mobile_no || "").trim();
							entry.email_id = String(entry.email_id || resolved.email_id || "").trim();
						})
					);

					if (requestId !== me._newOppSalesPrefillReq) return;
					if (String(me.getNewOpportunityPartyName() || "").trim() !== customerName) return;

					me.setNewOpportunitySalesTeam(salesPeople);

					// Pre-populate the inline sales person field with the first sales person
					const firstEntry = salesPeople[0];
					if (firstEntry?.sales_person) {
						if (me._newOppSalesPersonControl?.set_value) {
							me._newOppSalesPersonControl.set_value(firstEntry.sales_person);
						}
						const $display = $(me.page.wrapper).find("#new-opp-sales-person-display");
						if ($display.length) {
							const safeName = frappe.utils.escape_html(firstEntry.sales_person);
							const safeMobile = frappe.utils.escape_html(firstEntry.mobile_no || "");
							const safeEmail = frappe.utils.escape_html(firstEntry.email_id || "");
							me._newOppSalesPersonExpanded = false;
							$display.html(`
							<div class="new-opp-contact-entry" data-sales-person-inline="${safeName}">
								<div class="new-opp-contact-entry-top">
									<span class="new-opp-contact-entry-name" title="${safeName}">
										<span class="new-opp-sales-person-name-toggle">${safeName}</span>
									</span>
								</div>
								<div class="new-opp-contact-entry-details d-none">
									${safeMobile ? `<div class="new-opp-contact-entry-meta" title="${safeMobile}">${safeMobile}</div>` : ""}
									${safeEmail ? `<div class="new-opp-contact-entry-meta" title="${safeEmail}">${safeEmail}</div>` : ""}
									${!safeMobile && !safeEmail ? `<div class="new-opp-contact-entry-meta text-muted">No details</div>` : ""}
								</div>
							</div>
						`);
						}
					}
				} catch (e) {
					if (requestId !== me._newOppSalesPrefillReq) return;
					me.setNewOpportunitySalesTeam([]);
				}
			};

			const prefillContactAndAddressFromCustomer = async () => {
				if (Date.now() < Number(me._newOppPreserveFromOpportunityUntil || 0)) {
					return;
				}
				me._newOppPartyPrefillReq = Number(me._newOppPartyPrefillReq || 0) + 1;
				const requestId = me._newOppPartyPrefillReq;

				const customerName = String(me.getNewOpportunityPartyName() || "").trim();
				if (!customerName) {
					me.setNewOpportunityCustomerAddress("");
					me.setNewOpportunityShippingAddress("");
					me._newOppContactList = [];
					me._newOppSelectedContact = "";
					me._newOppContactMeta = {};
					$scope.trigger("new-opp-contact-changed");
					syncAddressPreviews();
					return;
				}

				// Clear stale contact meta from the previous customer immediately
				me._newOppContactMeta = {};

				try {
					const customerDoc = await frappe.db.get_doc("Customer", customerName);
					if (requestId !== me._newOppPartyPrefillReq) return;
					if (String(me.getNewOpportunityPartyName() || "").trim() !== customerName) return;

					let customerAddress = String(
						customerDoc?.customer_primary_address
						|| customerDoc?.primary_address
						|| customerDoc?.customer_address
						|| ""
					).trim();

					let shippingAddress = String(
						customerDoc?.shipping_address_name
						|| customerDoc?.shipping_address
						|| ""
					).trim();

					const primaryContact = String(
						customerDoc?.customer_primary_contact
						|| customerDoc?.primary_contact
						|| customerDoc?.default_contact
						|| ""
					).trim();

					// Always fetch all linked addresses and contacts via Dynamic Link
					const linkedRows = await frappe.db.get_list("Dynamic Link", {
						fields: ["parent", "parenttype"],
						filters: {
							link_doctype: "Customer",
							link_name: customerName,
							parenttype: ["in", ["Address", "Contact"]],
						},
						limit: 100,
					});

					if (requestId !== me._newOppPartyPrefillReq) return;
					if (String(me.getNewOpportunityPartyName() || "").trim() !== customerName) return;

					const linkedAddresses = (Array.isArray(linkedRows) ? linkedRows : [])
						.filter((row) => String(row?.parenttype || "").trim() === "Address")
						.map((row) => String(row?.parent || "").trim())
						.filter(Boolean);

					const linkedContacts = (Array.isArray(linkedRows) ? linkedRows : [])
						.filter((row) => String(row?.parenttype || "").trim() === "Contact")
						.map((row) => String(row?.parent || "").trim())
						.filter(Boolean);

					if (!customerAddress && linkedAddresses.length) {
						customerAddress = linkedAddresses[0];
					}
					if (!shippingAddress) {
						shippingAddress = linkedAddresses[1] || linkedAddresses[0] || "";
					}
					if (!customerAddress && shippingAddress) {
						customerAddress = shippingAddress;
					}

					me.setNewOpportunityCustomerAddress(customerAddress || shippingAddress);
					me.setNewOpportunityShippingAddress(shippingAddress || customerAddress);
					syncAddressPreviews();

					// Build full contact list: primary contact first, then all linked contacts (deduped)
					const allContacts = [...new Set(
						[primaryContact, ...linkedContacts].filter(Boolean)
					)];

					if (allContacts.length) {
						me._newOppContactList = allContacts;
						me._newOppSelectedContact = allContacts[0];

						// Pre-fetch metadata for all contacts in parallel so the list renders
						// immediately with full name / phone / email instead of lazy-load blanks
						await Promise.all(allContacts.map(async (contactId) => {
							if (requestId !== me._newOppPartyPrefillReq) return;
							try {
								const contactDoc = await frappe.db.get_doc("Contact", contactId);
								if (requestId !== me._newOppPartyPrefillReq) return;
								const phone = String(
									contactDoc?.mobile_no
									|| contactDoc?.phone
									|| contactDoc?.contact_mobile
									|| (Array.isArray(contactDoc?.phone_nos) ? contactDoc.phone_nos[0]?.phone : "")
									|| ""
								).trim();
								const email = String(
									contactDoc?.email_id
									|| contactDoc?.email
									|| (Array.isArray(contactDoc?.email_ids) ? contactDoc.email_ids[0]?.email_id : "")
									|| ""
								).trim();
								const fullName = String(
									contactDoc?.full_name
									|| contactDoc?.first_name
									|| contactId
								).trim();
								const designation = String(contactDoc?.designation || "").trim();
								me._newOppContactMeta[contactId] = {
									full_name: fullName,
									phone,
									email,
									designation,
									tpoc: allContacts[0] === contactId ? 1 : 0,
									_loaded: true,
								};
							} catch (e) {
								me._newOppContactMeta[contactId] = {
									full_name: contactId,
									phone: "",
									email: "",
									designation: "",
									tpoc: allContacts[0] === contactId ? 1 : 0,
									_loaded: true,
								};
							}
						}));
					}

					if (requestId !== me._newOppPartyPrefillReq) return;
					$scope.trigger("new-opp-contact-changed");
				} catch (e) {
					if (requestId !== me._newOppPartyPrefillReq) return;
				}
			};

			const runPartyPrefill = () => {
				prefillSalesTeamFromCustomer();
				prefillContactAndAddressFromCustomer();
				prefillPaymentTermsFromCustomer();
				applyIndiaComplianceTaxDefaults();
			};

			const prefillCompanyAddressFromCompany = async () => {
				if (Date.now() < Number(me._newOppPreserveFromOpportunityUntil || 0)) {
					return;
				}
				me._newOppCompanyPrefillReq = Number(me._newOppCompanyPrefillReq || 0) + 1;
				const requestId = me._newOppCompanyPrefillReq;

				const companyName = String(me.getNewOpportunityCompany() || "").trim();
				if (!companyName) {
					me.setNewOpportunityCompanyAddress("");
					syncAddressPreviews();
					return;
				}

				try {
					const companyDoc = await frappe.db.get_doc("Company", companyName);
					if (requestId !== me._newOppCompanyPrefillReq) return;
					if (String(me.getNewOpportunityCompany() || "").trim() !== companyName) return;

					let companyAddress = String(companyDoc?.company_address || companyDoc?.default_address || "").trim();

					if (!companyAddress) {
						const defaultAddressRes = await frappe.call({
							method: "frappe.contacts.doctype.address.address.get_default_address",
							args: { doctype: "Company", name: companyName },
						});
						companyAddress = String(
							defaultAddressRes?.message?.name
							|| defaultAddressRes?.message?.address
							|| defaultAddressRes?.message
							|| ""
						).trim();
					}

					if (!companyAddress) {
						const linkedRows = await frappe.db.get_list("Dynamic Link", {
							fields: ["parent", "parenttype"],
							filters: {
								link_doctype: "Company",
								link_name: companyName,
								parenttype: "Address",
							},
							limit: 10,
						});

						if (requestId !== me._newOppCompanyPrefillReq) return;
						if (String(me.getNewOpportunityCompany() || "").trim() !== companyName) return;

						companyAddress = String(linkedRows?.[0]?.parent || "").trim();
					}

					me.setNewOpportunityCompanyAddress(companyAddress);
					syncAddressPreviews();
				} catch (e) {
					if (requestId !== me._newOppCompanyPrefillReq) return;
				}
			};

			const getAddressRenderData = async (addressName = "") => {
				const addrName = String(addressName || "").trim();
				if (!addrName) return { gstin: "", addressText: "" };

				try {
					const addressDoc = await frappe.db.get_doc("Address", addrName);
					const gstin = String(addressDoc?.gstin || addressDoc?.gstin_no || addressDoc?.tax_id || "").trim();
					const lines = [
						String(addressDoc?.address_line1 || "").trim(),
						String(addressDoc?.address_line2 || "").trim(),
						[
							String(addressDoc?.city || "").trim(),
							String(addressDoc?.state || "").trim() ? `State Code: ${String(addressDoc?.state || "").trim()}` : "",
						].filter(Boolean).join(", "),
						String(addressDoc?.pincode || "").trim() ? `Postal Code: ${String(addressDoc?.pincode || "").trim()}` : "",
						String(addressDoc?.country || "").trim(),
					].filter(Boolean);

					return {
						gstin,
						addressText: lines.join("\n"),
					};
				} catch (e) {
					return { gstin: "", addressText: "" };
				}
			};

			const renderAddressPreview = async (addressName, previewKey) => {
				const suffix = String(previewKey || "").trim();
				if (!suffix) return;
				const data = await getAddressRenderData(addressName);
				$scope.find(`#new-opp-${suffix}-address-gstin`).val(data.gstin || "");
				$scope.find(`#new-opp-${suffix}-address-display`).val(data.addressText || "");
			};

			const syncAddressPreviews = async () => {
				await Promise.all([
					renderAddressPreview(me.getNewOpportunityCustomerAddress(), "billing"),
					renderAddressPreview(me.getNewOpportunityShippingAddress(), "shipping"),
					renderAddressPreview(me.getNewOpportunityCompanyAddress(), "company"),
				]);
			};

			const wireAddressControl = (control, getterFn, previewKey, hookFlag) => {
				if (!control || control[hookFlag]) return;
				control[hookFlag] = true;

				const handleChange = async () => {
					await renderAddressPreview(getterFn(), previewKey);
					await applyIndiaComplianceTaxDefaults();
					await renderTaxesPreview();
					await renderPaymentTermsPreview();
				};

				if (control.$input?.length) {
					control.$input
						.off(`awesomplete-selectcomplete.${hookFlag} link-change.${hookFlag} change.${hookFlag}`)
						.on(`awesomplete-selectcomplete.${hookFlag} link-change.${hookFlag} change.${hookFlag}`, handleChange);
				}

				const existingOnChange = control.df.onchange;
				control.df.onchange = async function () {
					if (typeof existingOnChange === "function") existingOnChange.call(this);
					await handleChange();
				};
			};

			const wireTermsTemplateControl = () => {
				const control = me._newOppTermsTemplateControl;
				if (!control || control._termsSyncHooked) return;
				control._termsSyncHooked = true;

				const applyTemplateTerms = async () => {
					const templateName = String(me.getNewOpportunityTermsTemplate() || "").trim();
					if (!templateName) {
						$scope.find("#new-opp-terms-and-conditions").html("");
						return;
					}

					try {
						const res = await frappe.db.get_value("Terms and Conditions", templateName, ["terms"]);
						$scope.find("#new-opp-terms-and-conditions").html(String(res?.message?.terms || "").trim());
					} catch (e) {
						$scope.find("#new-opp-terms-and-conditions").html("");
					}
				};

				if (control.$input?.length) {
					control.$input
						.off("awesomplete-selectcomplete.termsSync link-change.termsSync change.termsSync")
						.on("awesomplete-selectcomplete.termsSync link-change.termsSync change.termsSync", applyTemplateTerms);
				}

				const existingOnChange = control.df.onchange;
				control.df.onchange = async function () {
					if (typeof existingOnChange === "function") existingOnChange.call(this);
					await applyTemplateTerms();
				};
			};

			const getStateKeyFromAddress = async (addressName = "") => {
				const addr = String(addressName || "").trim();
				if (!addr) return { gstCode: "", stateName: "" };
				try {
					const addressDoc = await frappe.db.get_doc("Address", addr);
					const gstin = String(addressDoc?.gstin || addressDoc?.gstin_no || addressDoc?.tax_id || "").trim();
					const gstStateNumberRaw = String(addressDoc?.gst_state_number || "").trim();
					const gstStateRaw = String(addressDoc?.gst_state || "").trim();
					const stateRaw = String(addressDoc?.state || "").trim();

					const normalizeState = (value = "") => String(value || "")
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, " ")
						.replace(/\s+/g, " ")
						.trim();

					const codeFromGstin = /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : "";
					const codeFromStateNumber = /^\d{1,2}$/.test(gstStateNumberRaw)
						? String(parseInt(gstStateNumberRaw, 10)).padStart(2, "0")
						: "";
					const codeFromGstState = /^\d{1,2}/.test(gstStateRaw)
						? String(parseInt(gstStateRaw.match(/^\d{1,2}/)?.[0] || "", 10)).padStart(2, "0")
						: "";
					const gstCode = codeFromGstin || codeFromStateNumber || codeFromGstState;

					const stateName = normalizeState(stateRaw || gstStateRaw.replace(/^\d{1,2}\s*[-:]?\s*/, ""));
					return { gstCode, stateName };
				} catch (e) {
					return { gstCode: "", stateName: "" };
				}
			};

			const getCustomerTaxProfile = async () => {
				const customerName = String(me.getNewOpportunityPartyName() || "").trim();
				if (!customerName) return { gstCategory: "", taxCategory: "" };

				const cache = me._newOppCustomerTaxProfileCache || {};
				if (cache.customerName === customerName) {
					return {
						gstCategory: String(cache.gstCategory || "").trim(),
						taxCategory: String(cache.taxCategory || "").trim(),
					};
				}

				try {
					const customerDoc = await frappe.db.get_doc("Customer", customerName);
					const profile = {
						gstCategory: String(customerDoc?.gst_category || "").trim(),
						taxCategory: String(customerDoc?.tax_category || "").trim(),
					};
					me._newOppCustomerTaxProfileCache = {
						customerName,
						...profile,
					};
					return profile;
				} catch (e) {
					return { gstCategory: "", taxCategory: "" };
				}
			};

			const isSezLikeCustomer = async () => {
				const profile = await getCustomerTaxProfile();
				const gstCategory = String(profile?.gstCategory || "").trim().toLowerCase();
				return Boolean(
					gstCategory === "sez"
					|| gstCategory === "special economic zone"
					|| gstCategory === "overseas"
					|| gstCategory.includes("export")
				);
			};

			const resolveTaxCategoryByPatterns = async (patterns = [], fallback = "") => {
				for (const pattern of patterns) {
					try {
						const rows = await frappe.db.get_list("Tax Category", {
							fields: ["name"],
							filters: { name: ["like", pattern] },
							limit: 1,
						});
						const match = Array.isArray(rows) ? rows[0] : null;
						if (match?.name) return String(match.name || "").trim();
					} catch (e) {
						// no-op
					}
				}
				return String(fallback || "").trim();
			};

			const resolveTaxCategoryName = async (wantInState = true) => {
				const patterns = wantInState
					? ["%In-State%", "%In State%", "%Instate%"]
					: ["%Out-State%", "%Out State%", "%Inter State%", "%Inter-State%", "%Outstate%"];
				return resolveTaxCategoryByPatterns(patterns, wantInState ? "In-State" : "Out-State");
			};

			const resolveSezTaxCategoryName = async () => {
				return resolveTaxCategoryByPatterns(
					["%Out-State-No-Tax%", "%Out State No Tax%", "%No-Tax%", "%No Tax%", "%SEZ%", "%Exempt%", "%Zero%"],
					"Out-State-No-Tax"
				);
			};

			const isRcmTemplateDoc = (templateDoc) => {
				const nameText = String(templateDoc?.name || "").trim().toLowerCase();
				const categoryText = String(templateDoc?.tax_category || "").trim().toLowerCase();
				if (nameText.includes("rcm") || categoryText.includes("rcm") || categoryText.includes("reverse charge")) {
					return true;
				}

				const rows = Array.isArray(templateDoc?.taxes) ? templateDoc.taxes : [];
				return rows.some((row) => {
					const accountHead = String(row?.account_head || row?.account || "").trim().toLowerCase();
					return accountHead.includes("rcm") || accountHead.includes("reverse charge");
				});
			};

			const inferTemplateDirection = (templateDoc) => {
				const nameText = String(templateDoc?.name || "").trim().toLowerCase();
				const categoryText = String(templateDoc?.tax_category || "").trim().toLowerCase();
				const combined = `${nameText} ${categoryText}`;

				if (
					combined.includes("out-state")
					|| combined.includes("out state")
					|| combined.includes("inter-state")
					|| combined.includes("inter state")
					|| combined.includes("igst")
				) {
					return "out";
				}

				if (
					combined.includes("in-state")
					|| combined.includes("in state")
					|| combined.includes("cgst")
					|| combined.includes("sgst")
					|| combined.includes("utgst")
				) {
					return "in";
				}

				const rows = Array.isArray(templateDoc?.taxes) ? templateDoc.taxes : [];
				let hasIgst = false;
				let hasInStateHeads = false;
				rows.forEach((row) => {
					const accountHead = String(row?.account_head || row?.account || "").trim().toLowerCase();
					if (accountHead.includes("igst")) hasIgst = true;
					if (accountHead.includes("cgst") || accountHead.includes("sgst") || accountHead.includes("utgst")) {
						hasInStateHeads = true;
					}
				});

				if (hasIgst && !hasInStateHeads) return "out";
				if (hasInStateHeads && !hasIgst) return "in";
				return "";
			};

			const inferDirectionFromTaxCategory = (taxCategoryName = "") => {
				const text = String(taxCategoryName || "").trim().toLowerCase();
				if (!text) return "";
				if (
					text.includes("out-state")
					|| text.includes("out state")
					|| text.includes("inter-state")
					|| text.includes("inter state")
				) return "out";
				if (text.includes("in-state") || text.includes("in state")) return "in";
				return "";
			};

			const resolveTaxesTemplateName = async (wantInState = true) => {
				const company = String(me.getNewOpportunityCompany() || "").trim();
				const taxCategory = String(me.getNewOpportunityTaxCategory() || "").trim();
				const expectedDirection = wantInState ? "in" : "out";

				const pickNonRcmTemplate = async (rows = [], strictDirection = true) => {
					let relaxedCandidate = "";
					const candidates = (Array.isArray(rows) ? rows : [])
						.map((row) => String(row?.name || "").trim())
						.filter(Boolean);
					for (const candidate of candidates) {
						try {
							const candidateDoc = await frappe.db.get_doc("Sales Taxes and Charges Template", candidate);
							if (isRcmTemplateDoc(candidateDoc)) continue;
							const direction = inferTemplateDirection(candidateDoc);
							if (!strictDirection) {
								if (!relaxedCandidate) relaxedCandidate = candidate;
								continue;
							}
							if (!direction || direction === expectedDirection) return candidate;
						} catch (e) {
							// no-op
						}
					}
					return strictDirection ? "" : relaxedCandidate;
				};

				try {
					const rows = await frappe.db.get_list("Sales Taxes and Charges Template", {
						fields: ["name"],
						filters: {
							...(company ? { company } : {}),
							...(taxCategory ? { tax_category: taxCategory } : {}),
						},
						limit: 25,
					});
					const direct = await pickNonRcmTemplate(rows, true);
					if (direct) return direct;
				} catch (e) {
					// no-op
				}

				const patterns = wantInState
					? ["%In-state%", "%In State%", "%Instate%"]
					: ["%Out-state%", "%Out State%", "%Inter State%", "%Inter-State%", "%Outstate%"];

				for (const pattern of patterns) {
					try {
						const rows = await frappe.db.get_list("Sales Taxes and Charges Template", {
							fields: ["name"],
							filters: {
								...(company ? { company } : {}),
								name: ["like", pattern],
							},
							limit: 25,
						});
						const match = await pickNonRcmTemplate(rows, true);
						if (match) return match;
					} catch (e) {
						// no-op
					}
				}

				try {
					const fallbackRows = await frappe.db.get_list("Sales Taxes and Charges Template", {
						fields: ["name"],
						filters: {
							...(company ? { company } : {}),
						},
						limit: 25,
					});
					const fallbackMatch = await pickNonRcmTemplate(fallbackRows, true);
					if (fallbackMatch) return fallbackMatch;
					const fallbackRelaxed = await pickNonRcmTemplate(fallbackRows, false);
					if (fallbackRelaxed) return fallbackRelaxed;
				} catch (e) {
					// no-op
				}

				return "";
			};

			const isTaxFreeTemplateDoc = (templateDoc) => {
				const rows = Array.isArray(templateDoc?.taxes) ? templateDoc.taxes : [];
				if (!rows.length) return true;
				return rows.every((row) => {
					const chargeType = String(row?.charge_type || row?.type || "On Net Total").trim();
					const rate = Number(row?.rate || row?.tax_rate || 0) || 0;
					const actualAmount = Number(row?.tax_amount || row?.amount || 0) || 0;
					if (chargeType === "Actual") return actualAmount <= 0;
					return rate <= 0;
				});
			};

			const resolveSezTaxesTemplateName = async () => {
				const company = String(me.getNewOpportunityCompany() || "").trim();
				const taxCategory = String(me.getNewOpportunityTaxCategory() || "").trim();
				const patterns = ["%No-Tax%", "%No Tax%", "%SEZ%", "%Exempt%", "%Zero%"];
				const candidates = [];

				const appendCandidateRows = async (filters = {}) => {
					try {
						const rows = await frappe.db.get_list("Sales Taxes and Charges Template", {
							fields: ["name"],
							filters,
							limit: 25,
						});
						(Array.isArray(rows) ? rows : []).forEach((row) => {
							const name = String(row?.name || "").trim();
							if (name && !candidates.includes(name)) candidates.push(name);
						});
					} catch (e) {
						// no-op
					}
				};

				if (taxCategory) {
					await appendCandidateRows({
						...(company ? { company } : {}),
						tax_category: taxCategory,
					});
				}

				for (const pattern of patterns) {
					await appendCandidateRows({
						...(company ? { company } : {}),
						name: ["like", pattern],
					});
				}

				for (const candidate of candidates) {
					try {
						const doc = await frappe.db.get_doc("Sales Taxes and Charges Template", candidate);
						if (isTaxFreeTemplateDoc(doc)) return candidate;
					} catch (e) {
						// no-op
					}
				}

				return "";
			};

			const applyIndiaComplianceTaxDefaults = async () => {
				if (Date.now() < Number(me._newOppPreserveFromOpportunityUntil || 0)) return;

				const sezLikeCustomer = await isSezLikeCustomer();

				const billingAddress = String(me.getNewOpportunityCustomerAddress() || "").trim();
				const companyAddress = String(me.getNewOpportunityCompanyAddress() || "").trim();
				let isInState = null;
				if (billingAddress && companyAddress) {
					const [billingState, companyState] = await Promise.all([
						getStateKeyFromAddress(billingAddress),
						getStateKeyFromAddress(companyAddress),
					]);

					const sameByCode = billingState.gstCode && companyState.gstCode && billingState.gstCode === companyState.gstCode;
					const sameByName = billingState.stateName && companyState.stateName && billingState.stateName === companyState.stateName;
					isInState = Boolean(sameByCode || sameByName);
				}

				if (!me._newOppTaxCategoryManuallyChanged || !me.getNewOpportunityTaxCategory()) {
					const categoryName = sezLikeCustomer
						? await resolveSezTaxCategoryName()
						: (isInState === null ? "" : await resolveTaxCategoryName(isInState));
					if (categoryName) me.setNewOpportunityTaxCategory(categoryName);
				}

				if (!me._newOppTaxTemplateManuallyChanged || !me.getNewOpportunityTaxTemplate()) {
					let templateName = "";
					if (sezLikeCustomer) {
						templateName = await resolveSezTaxesTemplateName();
					} else {
						templateName = isInState === null ? "" : await resolveTaxesTemplateName(isInState);
						if (!templateName) templateName = await resolveTaxesTemplateName(true);
						if (!templateName) templateName = await resolveTaxesTemplateName(false);
					}
					if (templateName) {
						me.setNewOpportunityTaxTemplate(templateName);
					} else if (sezLikeCustomer) {
						me.setNewOpportunityTaxTemplate("");
					}
				}
			};

			const syncTaxCategoryFromTemplate = async () => {
				if (Date.now() < Number(me._newOppPreserveFromOpportunityUntil || 0)) return;
				if (me._newOppTaxCategoryManuallyChanged && me.getNewOpportunityTaxCategory()) return;

				const templateName = String(me.getNewOpportunityTaxTemplate() || "").trim();
				if (!templateName) return;

				try {
					const templateDoc = await frappe.db.get_doc("Sales Taxes and Charges Template", templateName);
					const categoryName = String(templateDoc?.tax_category || "").trim();
					if (categoryName) {
						me.setNewOpportunityTaxCategory(categoryName);
					}
				} catch (e) {
					// no-op
				}
			};

			const prefillPaymentTermsFromCustomer = async () => {
				if (Date.now() < Number(me._newOppPreserveFromOpportunityUntil || 0)) return;
				if (me._newOppPaymentTermsManuallyChanged && me.getNewOpportunityPaymentTermsTemplate()) return;

				const customerName = String(me.getNewOpportunityPartyName() || "").trim();
				if (!customerName) return;

				try {
					const customerDoc = await frappe.db.get_doc("Customer", customerName);
					const template = String(
						customerDoc?.payment_terms_template
						|| customerDoc?.default_payment_terms_template
						|| customerDoc?.payment_terms
						|| ""
					).trim();
					if (template) me.setNewOpportunityPaymentTermsTemplate(template);
				} catch (e) {
					// no-op
				}
			};

			me._runNewOppTaxDefaults = async () => {
				await applyIndiaComplianceTaxDefaults();
				await syncTaxCategoryFromTemplate();
			};
			me._runNewOppPaymentTermsPrefill = prefillPaymentTermsFromCustomer;

			const wireTaxAndPaymentControls = () => {
				const bindManualFlag = (ctrl, flagName, onAfterChange = null) => {
					if (!ctrl || ctrl[`${flagName}Hooked`]) return;
					ctrl[`${flagName}Hooked`] = true;
					const mark = async () => {
						me[flagName] = true;
						if (typeof onAfterChange === "function") {
							await onAfterChange();
						}
					};
					if (ctrl.$input?.length) {
						ctrl.$input
							.off(`awesomplete-selectcomplete.${flagName} link-change.${flagName} change.${flagName}`)
							.on(`awesomplete-selectcomplete.${flagName} link-change.${flagName} change.${flagName}`, mark);
					}
					const existingOnChange = ctrl.df.onchange;
					ctrl.df.onchange = async function () {
						if (typeof existingOnChange === "function") existingOnChange.call(this);
						await mark();
					};
				};

				bindManualFlag(me._newOppTaxCategoryControl, "_newOppTaxCategoryManuallyChanged", async () => {
					await applyIndiaComplianceTaxDefaults();
					await renderTaxesPreview();
					await renderPaymentTermsPreview();
				});
				bindManualFlag(me._newOppTaxTemplateControl, "_newOppTaxTemplateManuallyChanged", async () => {
					await syncTaxCategoryFromTemplate();
					await renderTaxesPreview();
					await renderPaymentTermsPreview();
				});
				bindManualFlag(me._newOppPaymentTermsControl, "_newOppPaymentTermsManuallyChanged", async () => {
					await renderPaymentTermsPreview();
				});
			};

			const getNewOppItemsNetTotal = () => {
				return $scope
					.find("#new-opp-items-table-body tr.new-opp-item-main-row")
					.map((_, row) => {
						const $row = $(row);
						const stored = {
							...($row.data("sourceItemFields") || {}),
							...($row.data("extraItemFields") || {}),
							...($row.data("manualItemValues") || {}),
						};
						const fieldVal = String($row.find(".new-opp-item-amount").val() || "").trim();
						const raw = fieldVal || String(stored.amount || "").trim();
						const parsed = parseFloat(String(raw || "0").replace(/,/g, ""));
						return Number.isFinite(parsed) ? parsed : 0;
					})
					.get()
					.reduce((sum, value) => sum + Number(value || 0), 0);
			};

			const getIsoDateString = (value) => {
				const normalized = String(value || "").trim();
				return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
			};

			const formatPreviewDate = (value) => {
				const normalized = getIsoDateString(value);
				if (!normalized) return "-";
				return frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(normalized) : normalized;
			};

			const getNewOppTransactionBaseDate = () => {
				const inputDate = getIsoDateString($scope.find("#new-opp-transaction-date").val());
				if (inputDate) return inputDate;
				return getIsoDateString(me._newOppTransactionDate || frappe.datetime?.nowdate?.() || "");
			};

			const addDaysToIsoDate = (dateString, daysToAdd) => {
				const normalized = getIsoDateString(dateString);
				if (!normalized) return "";
				const [year, month, day] = normalized.split("-").map(Number);
				const result = new Date(year, month - 1, day);
				result.setDate(result.getDate() + Number(daysToAdd || 0));
				const resultYear = result.getFullYear();
				const resultMonth = String(result.getMonth() + 1).padStart(2, "0");
				const resultDay = String(result.getDate()).padStart(2, "0");
				return `${resultYear}-${resultMonth}-${resultDay}`;
			};

			const getEndOfMonthIsoDate = (dateString) => {
				const normalized = getIsoDateString(dateString);
				if (!normalized) return "";
				const [year, month] = normalized.split("-").map(Number);
				const result = new Date(year, month, 0);
				const resultYear = result.getFullYear();
				const resultMonth = String(result.getMonth() + 1).padStart(2, "0");
				const resultDay = String(result.getDate()).padStart(2, "0");
				return `${resultYear}-${resultMonth}-${resultDay}`;
			};

			const addMonthsFromMonthEndIsoDate = (dateString, monthsToAdd) => {
				const monthEnd = getEndOfMonthIsoDate(dateString);
				if (!monthEnd) return "";
				const [year, month] = monthEnd.split("-").map(Number);
				const result = new Date(year, month - 1 + Number(monthsToAdd || 0) + 1, 0);
				const resultYear = result.getFullYear();
				const resultMonth = String(result.getMonth() + 1).padStart(2, "0");
				const resultDay = String(result.getDate()).padStart(2, "0");
				return `${resultYear}-${resultMonth}-${resultDay}`;
			};

			const resolvePaymentTermDueDate = (row, baseDate) => {
				const dueDateBasedOn = String(row?.due_date_based_on || row?.credit_days_based_on || "Day(s) after invoice date").trim();
				const creditDays = Number(row?.credit_days || 0) || 0;
				const creditMonths = Number(row?.credit_months || 0) || 0;
				if (!baseDate) return "";

				switch (dueDateBasedOn) {
					case "Day(s) after the end of the invoice month":
						return addDaysToIsoDate(getEndOfMonthIsoDate(baseDate), creditDays);
					case "Month(s) after the end of the invoice month":
						return addMonthsFromMonthEndIsoDate(baseDate, creditMonths);
					case "Day(s) after invoice date":
					default:
						return addDaysToIsoDate(baseDate, creditDays);
				}
			};

			const computeTaxesPreviewData = async () => {
				let templateName = String(me.getNewOpportunityTaxTemplate() || "").trim();
				const netTotal = getNewOppItemsNetTotal();
				const sezLikeCustomer = await isSezLikeCustomer();
				if (!templateName) {
					return {
						templateName: "",
						netTotal,
						totalTaxes: 0,
						grandTotal: netTotal,
						rows: [],
					};
				}

				const hasTemplateAccountMismatch = async (templateDoc, selectedCompany) => {
					if (!selectedCompany) return false;
					const taxRows = Array.isArray(templateDoc?.taxes) ? templateDoc.taxes : [];
					const accountHeads = [...new Set(
						taxRows
							.map((row) => String(row?.account_head || row?.account || "").trim())
							.filter(Boolean)
					)];
					if (!accountHeads.length) return false;

					try {
						const accountRows = await frappe.db.get_list("Account", {
							fields: ["name", "company"],
							filters: {
								name: ["in", accountHeads],
							},
							limit: accountHeads.length,
						});
						const companyByAccount = new Map((Array.isArray(accountRows) ? accountRows : []).map((row) => [
							String(row?.name || "").trim(),
							String(row?.company || "").trim(),
						]));
						return accountHeads.some((account) => {
							const accountCompany = String(companyByAccount.get(account) || "").trim();
							return accountCompany && accountCompany !== selectedCompany;
						});
					} catch (e) {
						return false;
					}
				};

				const findCompanyCompatibleTemplate = async ({ selectedCompany, categoryHint = "", requireTaxFree = false, requireNonRcm = false, requiredDirection = "" } = {}) => {
					if (!selectedCompany) return "";
					const candidateNames = [];

					const appendCandidates = async (filters = {}) => {
						try {
							const rows = await frappe.db.get_list("Sales Taxes and Charges Template", {
								fields: ["name"],
								filters,
								limit: 20,
							});
							(Array.isArray(rows) ? rows : []).forEach((row) => {
								const name = String(row?.name || "").trim();
								if (name && !candidateNames.includes(name)) candidateNames.push(name);
							});
						} catch (e) {
							// no-op
						}
					};

					if (categoryHint) {
						await appendCandidates({ company: selectedCompany, tax_category: categoryHint });
					}
					await appendCandidates({ company: selectedCompany });

					for (const candidateName of candidateNames) {
						try {
							const candidateDoc = await frappe.db.get_doc("Sales Taxes and Charges Template", candidateName);
							if (requireTaxFree && !isTaxFreeTemplateDoc(candidateDoc)) continue;
							if (requireNonRcm && isRcmTemplateDoc(candidateDoc)) continue;
							if (requiredDirection) {
								const direction = inferTemplateDirection(candidateDoc);
								if (direction && direction !== requiredDirection) continue;
							}
							const mismatch = await hasTemplateAccountMismatch(candidateDoc, selectedCompany);
							if (!mismatch) return candidateName;
						} catch (e) {
							// no-op
						}
					}

					return "";
				};

				let templateDoc = await frappe.db.get_doc("Sales Taxes and Charges Template", templateName);
				const selectedCompany = String(me.getNewOpportunityCompany() || "").trim();
				const templateCompany = String(templateDoc?.company || "").trim();
				const accountMismatch = await hasTemplateAccountMismatch(templateDoc, selectedCompany);
				const nonTaxFreeForSez = sezLikeCustomer && !isTaxFreeTemplateDoc(templateDoc);
				const rcmForRegular = !sezLikeCustomer && isRcmTemplateDoc(templateDoc);
				const desiredDirection = inferDirectionFromTaxCategory(me.getNewOpportunityTaxCategory());
				const currentDirection = inferTemplateDirection(templateDoc);
				const directionMismatch = Boolean(!sezLikeCustomer && desiredDirection && currentDirection && desiredDirection !== currentDirection);
				if (
					selectedCompany
					&& (
						((templateCompany && selectedCompany !== templateCompany) || accountMismatch)
						|| nonTaxFreeForSez
						|| rcmForRegular
						|| directionMismatch
					)
				) {
					const categoryHint = String(templateDoc?.tax_category || me.getNewOpportunityTaxCategory() || "").trim();
					const replacementName = await findCompanyCompatibleTemplate({
						selectedCompany,
						categoryHint,
						requireTaxFree: nonTaxFreeForSez,
						requireNonRcm: !sezLikeCustomer,
						requiredDirection: sezLikeCustomer ? "" : desiredDirection,
					});
					if (replacementName) {
						templateName = replacementName;
						me.setNewOpportunityTaxTemplate(replacementName);
						templateDoc = await frappe.db.get_doc("Sales Taxes and Charges Template", replacementName);
					} else if (nonTaxFreeForSez) {
						me.setNewOpportunityTaxTemplate("");
						return {
							templateName: "",
							netTotal,
							totalTaxes: 0,
							grandTotal: netTotal,
							rows: [],
						};
					}
				}
				const rows = Array.isArray(templateDoc?.taxes) ? templateDoc.taxes : [];
				let previousAmount = 0;
				let runningTotal = netTotal;
				let totalTaxes = 0;

				const previewRows = rows.map((row, index) => {
					const chargeType = String(row?.charge_type || row?.type || "On Net Total").trim();
					const accountHead = String(row?.account_head || row?.account || "").trim();
					const rate = Number(row?.rate || row?.tax_rate || 0) || 0;
					let amount = 0;
					if (sezLikeCustomer) {
						amount = 0;
					} else {

						switch (chargeType) {
							case "Actual":
								amount = Number(row?.tax_amount || row?.amount || 0) || 0;
								break;
							case "On Previous Row Amount":
								amount = (previousAmount * rate) / 100;
								break;
							case "On Previous Row Total":
								amount = (runningTotal * rate) / 100;
								break;
							case "On Net Total":
							default:
								amount = (netTotal * rate) / 100;
								break;
						}
					}

					previousAmount = amount;
					runningTotal += amount;
					totalTaxes += amount;

					return {
						idx: index + 1,
						chargeType,
						accountHead,
						rate,
						amount,
						total: runningTotal,
					};
				});

				return {
					templateName,
					netTotal,
					totalTaxes,
					grandTotal: netTotal + totalTaxes,
					rows: previewRows,
				};
			};

			const renderTaxesPreview = async () => {
				const $tbody = $scope.find("#new-opp-taxes-preview-body");
				const $total = $scope.find("#new-opp-taxes-preview-total");
				const $wrap = $scope.find("#new-opp-taxes-preview-wrap");
				if (!$tbody.length || !$total.length || !$wrap.length) return;

				const templateName = String(me.getNewOpportunityTaxTemplate() || "").trim();
				const netTotal = getNewOppItemsNetTotal();

				if (!templateName) {
					$wrap.addClass("d-none");
					$tbody.html("");
					$total.text(fmtCurrency(0));
					return;
				}

				try {
					const preview = await computeTaxesPreviewData();
					if (!preview.rows.length) {
						$wrap.removeClass("d-none");
						$tbody.html('<tr><td colspan="6" class="text-muted text-center">No tax rows in selected template</td></tr>');
						$total.text(fmtCurrency(0));
						return;
					}

					const bodyHtml = preview.rows.map((row) => {
						const chargeTypeSafe = frappe.utils.escape_html(row.chargeType || "-");
						const accountHeadSafe = frappe.utils.escape_html(row.accountHead || "-");
						return `
						<tr>
							<td class="line-items-center">${row.idx}</td>
							<td><span class="new-opp-cell-ellipsis" title="${chargeTypeSafe}">${chargeTypeSafe}</span></td>
							<td><span class="new-opp-cell-ellipsis" title="${accountHeadSafe}">${accountHeadSafe}</span></td>
							<td class="line-items-center">${frappe.utils.escape_html(String(row.rate))}</td>
							<td class="line-items-center">${frappe.utils.escape_html(fmtCurrency(row.amount))}</td>
							<td class="line-items-center">${frappe.utils.escape_html(fmtCurrency(row.total))}</td>
						</tr>
					`;
					}).join("");

					$wrap.removeClass("d-none");
					$tbody.html(bodyHtml);
					$total.text(fmtCurrency(preview.totalTaxes));
				} catch (e) {
					$wrap.removeClass("d-none");
					$tbody.html('<tr><td colspan="6" class="text-muted text-center">Unable to load tax template preview</td></tr>');
					$total.text(fmtCurrency(0));
				}
			};

			const renderPaymentTermsPreview = async () => {
				const $tbody = $scope.find("#new-opp-payment-preview-body");
				const $total = $scope.find("#new-opp-payment-preview-total");
				const $wrap = $scope.find("#new-opp-payment-preview-wrap");
				if (!$tbody.length || !$total.length || !$wrap.length) return;

				const templateName = String(me.getNewOpportunityPaymentTermsTemplate() || "").trim();
				if (!templateName) {
					$wrap.addClass("d-none");
					$tbody.html("");
					$total.text(fmtCurrency(0));
					return;
				}

				try {
					const templateDoc = await frappe.db.get_doc("Payment Terms Template", templateName);
					const rows = Array.isArray(templateDoc?.terms) ? templateDoc.terms : [];
					if (!rows.length) {
						$wrap.removeClass("d-none");
						$tbody.html('<tr><td colspan="6" class="text-muted text-center">No payment term rows in selected template</td></tr>');
						$total.text(fmtCurrency(0));
						return;
					}

					const taxPreview = await computeTaxesPreviewData().catch(() => ({ grandTotal: getNewOppItemsNetTotal() }));
					const payableAmount = Number(taxPreview?.grandTotal || 0) || 0;
					const baseDate = getNewOppTransactionBaseDate();
					let totalScheduled = 0;

					const bodyHtml = rows.map((row, index) => {
						const paymentTerm = String(row?.payment_term || "").trim();
						const description = String(row?.description || "").trim();
						const invoicePortion = Number(row?.invoice_portion || 0) || 0;
						const paymentAmount = (payableAmount * invoicePortion) / 100;
						const dueDate = resolvePaymentTermDueDate(row, baseDate);
						totalScheduled += paymentAmount;
						const paymentTermSafe = frappe.utils.escape_html(paymentTerm || "-");
						const descriptionSafe = frappe.utils.escape_html(description || "-");

						return `
						<tr>
							<td class="line-items-center">${index + 1}</td>
							<td><span class="new-opp-cell-ellipsis" title="${paymentTermSafe}">${paymentTermSafe}</span></td>
							<td><span class="new-opp-cell-ellipsis" title="${descriptionSafe}">${descriptionSafe}</span></td>
							<td class="line-items-center">${frappe.utils.escape_html(String(invoicePortion))}</td>
							<td class="line-items-center">${frappe.utils.escape_html(formatPreviewDate(dueDate))}</td>
							<td class="line-items-center">${frappe.utils.escape_html(fmtCurrency(paymentAmount))}</td>
						</tr>
					`;
					}).join("");

					$wrap.removeClass("d-none");
					$tbody.html(bodyHtml);
					$total.text(fmtCurrency(totalScheduled));
				} catch (e) {
					$wrap.removeClass("d-none");
					$tbody.html('<tr><td colspan="6" class="text-muted text-center">Unable to load payment terms preview</td></tr>');
					$total.text(fmtCurrency(0));
				}
			};

			me._renderNewOppTaxesPreview = renderTaxesPreview;
			me._renderNewOppPaymentTermsPreview = renderPaymentTermsPreview;

			const runCompanyPrefill = () => {
				prefillCompanyAddressFromCompany();
				applyIndiaComplianceTaxDefaults();
			};

			const renderContactMiniList = () => {
				const $display = $scope.find("#new-opp-contact-display");
				if (!$display.length) return;

				const uniqueContacts = Array.from(new Set(
					(Array.isArray(me._newOppContactList) ? me._newOppContactList : [])
						.map((value) => String(value || "").trim())
						.filter(Boolean)
				));

				me._newOppSelectedContact = uniqueContacts[0] || "";

				uniqueContacts.forEach((contactValue) => {
					if (!contactValue) return;
					if (me._newOppContactMeta?.[contactValue]?._loaded) return;
					if (me._newOppContactPhoneReq?.[contactValue]) return;

					me._newOppContactPhoneReq[contactValue] = true;
					frappe.db.get_value("Contact", contactValue, ["full_name", "first_name", "last_name", "mobile_no", "phone", "email_id"])
						.then((res) => {
							const fullName = String(
								res?.message?.full_name
								|| [res?.message?.first_name, res?.message?.last_name].filter(Boolean).join(" ")
								|| ""
							).trim();
							const phone = String(res?.message?.mobile_no || res?.message?.phone || "").trim();
							const email = String(res?.message?.email_id || "").trim();
							me._newOppContactMeta[contactValue] = { full_name: fullName, phone, email, _loaded: true };
							renderContactMiniList();
						})
						.catch(() => {
							me._newOppContactMeta[contactValue] = { full_name: "", phone: "", email: "", _loaded: true };
						})
						.finally(() => {
							delete me._newOppContactPhoneReq[contactValue];
						});
				});

				if (!uniqueContacts.length) {
					$display.html('<span class="new-opp-contact-empty">No contacts added.</span>');
					return;
				}

				const contactsHtml = uniqueContacts
					.map((contactValue) => {
						const displayName = String(me._newOppContactMeta?.[contactValue]?.full_name || "").trim();
						const safeContact = frappe.utils.escape_html(contactValue);
						const safeDisplayName = frappe.utils.escape_html(displayName || contactValue || "Contact");
						const phoneValue = String(me._newOppContactMeta?.[contactValue]?.phone || "").trim();
						const emailValue = String(me._newOppContactMeta?.[contactValue]?.email || "").trim();
						const safePhone = frappe.utils.escape_html(phoneValue);
						const safeEmail = frappe.utils.escape_html(emailValue);
						const details = [safePhone, safeEmail].filter(Boolean).join(" • ");
						const isExpanded = Boolean(me._newOppContactExpanded?.[contactValue]);
						return `
            <div class="new-opp-contact-entry" data-contact="${safeContact}">
              <div class="new-opp-contact-entry-top">
                <span class="new-opp-contact-entry-name" title="${safeDisplayName}">
							<i class="fa fa-circle" style="font-size:8px;color:#b9bec7;margin-right:8px;"></i>
							<span class="new-opp-contact-name-toggle">${safeDisplayName}</span>
                  <i class="fa fa-trash new-opp-contact-delete" title="Delete" style="margin-left:8px;cursor:pointer;"></i>
                </span>
              </div>
						<div class="new-opp-contact-entry-details ${isExpanded ? "" : "d-none"}">
                ${phoneValue ? `<div class="new-opp-contact-entry-meta" title="${safePhone}">${safePhone}</div>` : ""}
                ${emailValue ? `<div class="new-opp-contact-entry-meta" title="${safeEmail}">${safeEmail}</div>` : ""}
                ${!details ? `<div class="new-opp-contact-entry-meta text-muted">No details</div>` : ""}
              </div>
            </div>
          `;
					})
					.join("");

				$display.html(contactsHtml);
			};

			const validateMinimumContacts = async () => {
				const contactIds = Array.from(new Set(
					(Array.isArray(me._newOppContactList) ? me._newOppContactList : [])
						.map((value) => String(value || "").trim())
						.filter(Boolean)
				));

				if (!contactIds.length) {
					frappe.msgprint(__("Please add at least 1 contact person."));
					return false;
				}
				return true;
			};

			$scope
				.off("new-opp-contact-changed")
				.on("new-opp-contact-changed", function () {
					renderContactMiniList();
				});

			const renderSalesTeamMiniList = () => {
				const $display = $scope.find("#new-opp-sales-team-display");
				if (!$display.length) return;

				const salesTeamList = me.getNewOpportunitySalesTeam();
				if (!salesTeamList.length) {
					$display.html('<span class="new-opp-contact-empty">No sales person selected.</span>');
					return;
				}

				const html = salesTeamList
					.map((entry) => {
						const salesPersonValue = String(entry?.sales_person || "").trim();
						const mobileNo = String(entry?.mobile_no || "").trim();
						const emailId = String(entry?.email_id || "").trim();
						const allocatedPercentage = Number(entry?.allocated_percentage || 100) || 100;

						const safeValue = frappe.utils.escape_html(salesPersonValue || "Sales Person");
						const safeMobile = frappe.utils.escape_html(mobileNo);
						const safeEmail = frappe.utils.escape_html(emailId);
						const safeAllocated = frappe.utils.escape_html(`${allocatedPercentage}%`);
						return `
            <div class="new-opp-contact-entry" data-sales-person="${safeValue}">
              <div class="new-opp-contact-entry-top">
                <span class="new-opp-contact-entry-name" title="${safeValue}">
                  <span class="new-opp-sales-name">${safeValue}</span>
                </span>
                <i class="fa fa-trash new-opp-sales-delete" title="Delete"></i>
              </div>
              <div class="new-opp-contact-entry-details">
                ${mobileNo ? `<div class="new-opp-contact-entry-meta" title="${safeMobile}">${safeMobile}</div>` : ""}
                ${emailId ? `<div class="new-opp-contact-entry-meta" title="${safeEmail}">${safeEmail}</div>` : ""}
                <div class="new-opp-contact-entry-meta" title="Allocation ${safeAllocated}">Allocation: ${safeAllocated}</div>
              </div>
            </div>
          `;
					})
					.join("");

				$display.html(html);
			};

			$scope
				.off("new-opp-sales-team-changed")
				.on("new-opp-sales-team-changed", function () {
					renderSalesTeamMiniList();
				});

			if (me._newOppPartyControl?.$input?.length) {
				me._newOppPartyControl.$input
					.off("change.newOppSalesPrefill")
					.on("change.newOppSalesPrefill", function () {
						runPartyPrefill();
					});

				me._newOppPartyControl.$input
					.off("awesomplete-selectcomplete.newOppSalesPrefill link-change.newOppSalesPrefill")
					.on("awesomplete-selectcomplete.newOppSalesPrefill link-change.newOppSalesPrefill", function () {
						runPartyPrefill();
					});
			}

			if (me._newOppPartyControl && !me._newOppPartyControl._salesPrefillHooked) {
				const existingOnChange = me._newOppPartyControl.df.onchange;
				me._newOppPartyControl.df.onchange = function () {
					if (typeof existingOnChange === "function") {
						existingOnChange.call(this);
					}
					runPartyPrefill();
				};
				me._newOppPartyControl._salesPrefillHooked = true;
			}

			$scope
				.off("new-opp-party-changed")
				.on("new-opp-party-changed", function () {
					runPartyPrefill();
				});

			if (me._newOppCompanyControl?.$input?.length) {
				me._newOppCompanyControl.$input
					.off("change.newOppCompanyPrefill")
					.on("change.newOppCompanyPrefill", function () {
						runCompanyPrefill();
					});

				me._newOppCompanyControl.$input
					.off("awesomplete-selectcomplete.newOppCompanyPrefill link-change.newOppCompanyPrefill")
					.on("awesomplete-selectcomplete.newOppCompanyPrefill link-change.newOppCompanyPrefill", function () {
						runCompanyPrefill();
					});
			}

			if (me._newOppCompanyControl && !me._newOppCompanyControl._companyPrefillHooked) {
				const existingOnChange = me._newOppCompanyControl.df.onchange;
				me._newOppCompanyControl.df.onchange = function () {
					if (typeof existingOnChange === "function") {
						existingOnChange.call(this);
					}
					runCompanyPrefill();
				};
				me._newOppCompanyControl._companyPrefillHooked = true;
			}

			$scope
				.off("new-opp-company-changed")
				.on("new-opp-company-changed", function () {
					runCompanyPrefill();
				});

			$scope
				.off("click", ".new-opp-contact-tpoc")
				.on("click", ".new-opp-contact-tpoc", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const contactValue = String($(this).closest(".new-opp-contact-entry").data("contact") || "").trim();
					if (!contactValue) return;

					const isTpoc = Number(me._newOppContactMeta?.[contactValue]?.tpoc || 0) === 1;
					me._newOppContactMeta[contactValue] = {
						...(me._newOppContactMeta?.[contactValue] || {}),
						tpoc: isTpoc ? 0 : 1,
					};
					renderContactMiniList();
				});

			$scope
				.off("click", ".new-opp-contact-name-toggle")
				.on("click", ".new-opp-contact-name-toggle", function (e) {
					e.preventDefault();
					const contactValue = String($(this).closest(".new-opp-contact-entry").data("contact") || "").trim();
					if (!contactValue) return;
					me._newOppContactExpanded[contactValue] = !Boolean(me._newOppContactExpanded[contactValue]);
					renderContactMiniList();
				});

			$scope
				.off("click", ".new-opp-contact-delete")
				.on("click", ".new-opp-contact-delete", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const contactValue = String($(this).closest(".new-opp-contact-entry").data("contact") || "").trim();
					if (!contactValue) return;

					removeContactValue(contactValue);

					if (String(me._newOppSelectedContact || "").trim() === contactValue) {
						me._newOppSelectedContact = "";
					}
					delete me._newOppContactExpanded[contactValue];

					renderContactMiniList();
				});

			$scope
				.off("click", ".new-opp-sales-delete")
				.on("click", ".new-opp-sales-delete", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const salesPersonValue = String($(this).closest(".new-opp-contact-entry").data("sales-person") || "").trim();
					if (!salesPersonValue) return;

					const nextValues = me
						.getNewOpportunitySalesTeam()
						.filter((entry) => String(entry?.sales_person || "").trim() !== salesPersonValue);

					me.setNewOpportunitySalesTeam(nextValues);
					renderSalesTeamMiniList();
				});

			$scope
				.off("new-opp-items-visibility-refresh")
				.on("new-opp-items-visibility-refresh", function () {
					refreshNewOppItemsVisibility();
					renderTaxesPreview();
					renderPaymentTermsPreview();
				});

			$scope
				.off("click", "#new-opp-add-item")
				.on("click", "#new-opp-add-item", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard();
				});

			$scope
				.off("click", "#new-opp-add-first-item")
				.on("click", "#new-opp-add-first-item", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard();
				});

			$scope
				.off("click", "#new-opp-add-item-wizard")
				.on("click", "#new-opp-add-item-wizard", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard();
				});

			$scope
				.off("click", "#new-opp-add-item-renewal")
				.on("click", "#new-opp-add-item-renewal", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard("Renewal");
				});

			$scope
				.off("click", "#new-opp-add-item-additional")
				.on("click", "#new-opp-add-item-additional", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard("Additional");
				});


			$scope
				.off("click", ".new-opp-remove-item")
				.on("click", ".new-opp-remove-item", function (e) {
					e.preventDefault();
					const $mainRow = $(this).closest("tr.new-opp-item-main-row");
					removeItemMainRow($mainRow);
				});

			$scope
				.off("click", ".new-opp-delete-row")
				.on("click", ".new-opp-delete-row", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const $mainRow = $(this).closest("tr.new-opp-item-main-row");
					if (!$mainRow.length) return;

					frappe.confirm(
						__("Are you sure you want to delete this item row?"),
						() => {
							removeItemMainRow($mainRow);
						}
					);
				});

			$scope
				.off("click", ".new-opp-edit-row")
				.on("click", ".new-opp-edit-row", async function (e) {
					e.preventDefault();
					const $rowElement = $(this).closest("tr.new-opp-item-main-row");
					if (!$rowElement.length) return;
					me.setActiveNewOppRowHighlight($rowElement);

					// Collect row data for edit mode
					const stored = {
						...($rowElement.data("sourceItemFields") || {}),
						...($rowElement.data("extraItemFields") || {}),
						...($rowElement.data("currentItemValues") || {}),
						...($rowElement.data("manualItemValues") || {}),
					};

					const editItemData = {
						opportunity_type: String(stored.opportunity_type || "New").trim() || "New",
						item_code: String(stored.item_code || "").trim(),
						item_name: String(stored.item_name || "").trim(),
						qty: Number(stored.qty || 1),
						rate: Number(stored.rate || 0),
						amount: Number(stored.amount || 0),
						brand: String(stored.brand || "").trim(),
						item_group: String(stored.item_group || "").trim(),
						description: String(stored.description || "").trim(),
						hsncode: String(stored.hsncode || "").trim(),
						uom: String(stored.uom || "").trim(),
						renewal_id: String(stored.renewal_id || "").trim(),
						orc: Number(stored.orc || 0) ? 1 : 0,
						commission_type: String(stored.commission_type || "").trim(),
						rate_value: Number(stored.rate_value || 0),
						_rowElement: $rowElement,  // Pass row element for update
					};

					me.openNewOppItemWizard(null, editItemData);
				});

			$scope
				.off("input", ".new-opp-item-qty, .new-opp-item-rate, .new-opp-item-spq-rate")
				.on("input", ".new-opp-item-qty, .new-opp-item-rate, .new-opp-item-spq-rate", function () {
					recalcItemAmount($(this).closest("tr"));
					renderTaxesPreview();
					renderPaymentTermsPreview();
				});

			$scope
				.off("change", ".new-opp-item-orc")
				.on("change", ".new-opp-item-orc", function () {
					toggleOrcDependentFields($(this).closest("tr"));
				});

			$scope
				.off("click", "input[type='date']")
				.on("click", "input[type='date']", function () {
					openDatePicker(this);
				});

			$scope
				.off("input", ".new-opp-item-qty, .new-opp-item-rate, .new-opp-item-spq-rate")
				.on("input", ".new-opp-item-qty, .new-opp-item-rate, .new-opp-item-spq-rate", function () {
					recalcItemAmount($(this).closest("tr"));
				});

			$scope
				.off("change", ".new-opp-item-orc")
				.on("change", ".new-opp-item-orc", function () {
					toggleOrcDependentFields($(this).closest("tr"));
				});

			$scope
				.off("click", "input[type='date']")
				.on("click", "input[type='date']", function () {
					openDatePicker(this);
				});

			$scope
				.off("focusin", "input[type='date']")
				.on("focusin", "input[type='date']", function () {
					openDatePicker(this);
				});

			$scope
				.off("input", ".new-opp-item-code")
				.on("input", ".new-opp-item-code", function () {
					const $row = $(this).closest("tr");
					const itemCode = getRowItemCode($row);
					const existingTimer = $row.data("itemCodeAutofillTimer");
					if (existingTimer) clearTimeout(existingTimer);

					if (!itemCode) return;
					const timer = setTimeout(() => {
						autofillItemRowByCode($row, itemCode);
					}, 250);
					$row.data("itemCodeAutofillTimer", timer);
				});

			$scope
				.off("change blur", ".new-opp-item-code")
				.on("change blur", ".new-opp-item-code", async function () {
					const $row = $(this).closest("tr");
					const itemCode = getRowItemCode($row);
					await autofillItemRowByCode($row, itemCode);
				});

			$scope
				.off("awesomplete-selectcomplete link-change", ".new-opp-item-code")
				.on("awesomplete-selectcomplete link-change", ".new-opp-item-code", async function () {
					const $row = $(this).closest("tr");
					const itemCode = getRowItemCode($row);
					await autofillItemRowByCode($row, itemCode);
				});

			$scope
				.off("click", "#new-opp-contact-quick-add")
				.on("click", "#new-opp-contact-quick-add", function (e) {
					e.preventDefault();
					const selectedCustomer = me.getNewOpportunityPartyName();
					if (!selectedCustomer) {
						frappe.msgprint(__("Please select a Customer first."));
						return;
					}

					const dialog = new frappe.ui.Dialog({
						title: __("Add Contact Person"),
						fields: [
							{
								label: "Contact",
								fieldname: "contact_person",
								fieldtype: "Link",
								options: "Contact",
								reqd: 1,
								get_query: () => ({
									filters: { company_name: selectedCustomer },
								}),
							},
							{
								label: "Mobile No",
								fieldname: "mobile_no",
								fieldtype: "Data",
								read_only: 1,
							},
							{
								label: "Email ID",
								fieldname: "email_id",
								fieldtype: "Data",
								read_only: 1,
							},
							{
								label: "POC",
								fieldname: "tpoc",
								fieldtype: "Check",
								description: "Is this contact a Point of Contact?",
								default: 0,
							},
						],
						primary_action_label: __("Add"),
						primary_action(values) {
							const contactPerson = String(values.contact_person || "").trim();
							if (!contactPerson) return;

							const phoneValue = String(values.mobile_no || "").trim();
							const emailValue = String(values.email_id || "").trim();
							const fullName = String(dialog._contactFullName || "").trim();
							me._newOppContactMeta[contactPerson] = {
								full_name: fullName,
								phone: phoneValue,
								email: emailValue,
								tpoc: Number(values.tpoc || 0),
								_loaded: true,
							};
							me._newOppContactExpanded[contactPerson] = false;

							me.setNewOpportunityContact(contactPerson);
							addContactValue(contactPerson);

							renderContactMiniList();

							dialog.hide();
						},
					});

					dialog.fields_dict.contact_person.df.onchange = async function () {
						const contactName = String(dialog.get_value("contact_person") || "").trim();
						if (!contactName) {
							dialog._contactFullName = "";
							dialog.set_value("mobile_no", "");
							dialog.set_value("email_id", "");
							return;
						}

						const res = await frappe.db.get_value("Contact", contactName, ["full_name", "first_name", "last_name", "mobile_no", "phone", "email_id"]);
						const fullName = String(
							res?.message?.full_name
							|| [res?.message?.first_name, res?.message?.last_name].filter(Boolean).join(" ")
							|| ""
						).trim();
						const phone = String(res?.message?.mobile_no || res?.message?.phone || "").trim();
						const email = String(res?.message?.email_id || "").trim();
						dialog._contactFullName = fullName || "";
						dialog.set_value("mobile_no", phone || "");
						dialog.set_value("email_id", email || "");
					};

					dialog.show();
				});

			renderContactMiniList();

			// Quick-add handler for Sales Team
			$scope
				.off("click", "#new-opp-sales-team-quick-add")
				.on("click", "#new-opp-sales-team-quick-add", function (e) {
					e.preventDefault();

					const dialog = new frappe.ui.Dialog({
						title: __("Add Sales Person"),
						fields: [
							{
								label: "Sales Person",
								fieldname: "sales_person",
								fieldtype: "Link",
								options: "Sales Person",
								reqd: 1,
							},
							{
								label: "Allocated %",
								fieldname: "allocated_percentage",
								fieldtype: "Int",
								default: 100,
								description: "Percentage of commission allocation",
							},
							{
								label: "Mobile No",
								fieldname: "mobile_no",
								fieldtype: "Data",
								read_only: 1,
							},
							{
								label: "Email ID",
								fieldname: "email_id",
								fieldtype: "Data",
								read_only: 1,
							},
						],
						primary_action_label: __("Add"),
						primary_action(values) {
							const salesPerson = String(values.sales_person || "").trim();
							if (!salesPerson) return;

							// Check if already added
							const existing = me.getNewOpportunitySalesTeam();
							if (existing.some(sp => sp.sales_person === salesPerson)) {
								frappe.msgprint(__("This Sales Person is already added."));
								return;
							}

							const mobileNo = String(values.mobile_no || "").trim();
							const emailId = String(values.email_id || "").trim();
							const allocatedPercentage = Number(values.allocated_percentage || 100) || 100;

							// Add to team
							const currentTeam = me.getNewOpportunitySalesTeam();
							currentTeam.push({
								sales_person: salesPerson,
								mobile_no: mobileNo,
								email_id: emailId,
								allocated_percentage: allocatedPercentage,
							});
							me.setNewOpportunitySalesTeam(currentTeam);
							$scope.trigger("new-opp-sales-team-changed");

							dialog.hide();
						},
					});

					// Fetch sales person details on selection
					dialog.fields_dict.sales_person.df.onchange = async function () {
						const salesPersonName = String(dialog.get_value("sales_person") || "").trim();
						if (!salesPersonName) {
							dialog.set_value("mobile_no", "");
							dialog.set_value("email_id", "");
							return;
						}

						try {
							const result = await frappe.call({
								method: OPP_CFG.API.get_sales_person_details,
								args: { sales_person: salesPersonName },
							});
							const details = result?.message || {};
							dialog.set_value("mobile_no", String(details.mobile || ""));
							dialog.set_value("email_id", String(details.email || ""));
						} catch (e) {
							dialog.set_value("mobile_no", "");
							dialog.set_value("email_id", "");
						}
					};

					dialog.show();
				});

			// Render inline sales person display — name only; click name to expand email/mobile
			const renderSalesPersonDisplay = async (salesPersonName) => {
				const $display = $scope.find("#new-opp-sales-person-display");
				if (!$display.length) return;

				if (!salesPersonName) {
					$display.html("");
					me.setNewOpportunitySalesTeam([]);
					return;
				}

				const resolved = await resolveSalesPersonContact(salesPersonName);
				const safeName = frappe.utils.escape_html(salesPersonName);
				const safeMobile = frappe.utils.escape_html(resolved.mobile_no || "");
				const safeEmail = frappe.utils.escape_html(resolved.email_id || "");
				const isExpanded = Boolean(me._newOppSalesPersonExpanded);

				$display.html(`
				<div class="new-opp-contact-entry" data-sales-person-inline="${safeName}">
					<div class="new-opp-contact-entry-top">
						<span class="new-opp-contact-entry-name" title="${safeName}">
							<span class="new-opp-sales-person-name-toggle">${safeName}</span>
						</span>
					</div>
					<div class="new-opp-contact-entry-details ${isExpanded ? "" : "d-none"}">
						${safeMobile ? `<div class="new-opp-contact-entry-meta" title="${safeMobile}">${safeMobile}</div>` : ""}
						${safeEmail ? `<div class="new-opp-contact-entry-meta" title="${safeEmail}">${safeEmail}</div>` : ""}
						${!safeMobile && !safeEmail ? `<div class="new-opp-contact-entry-meta text-muted">No details</div>` : ""}
					</div>
				</div>
			`);

				me.setNewOpportunitySalesTeam([{
					sales_person: salesPersonName,
					mobile_no: resolved.mobile_no || "",
					email_id: resolved.email_id || "",
					allocated_percentage: 100,
				}]);
			};

			// Click to expand/collapse sales person details
			$scope
				.off("click", ".new-opp-sales-person-name-toggle")
				.on("click", ".new-opp-sales-person-name-toggle", function (e) {
					e.preventDefault();
					me._newOppSalesPersonExpanded = !Boolean(me._newOppSalesPersonExpanded);
					$(this).closest(".new-opp-contact-entry")
						.find(".new-opp-contact-entry-details")
						.toggleClass("d-none", !me._newOppSalesPersonExpanded);
				});

			// Hook into the sales person link control after it's rendered
			const wireNewOppSalesPersonControl = () => {
				const ctrl = me._newOppSalesPersonControl;
				if (!ctrl || ctrl._salesPersonChangeHooked) return;
				ctrl._salesPersonChangeHooked = true;

				const handleChange = async () => {
					const val = String(ctrl.get_value?.() || "").trim();
					await renderSalesPersonDisplay(val);
				};

				if (ctrl.$input?.length) {
					ctrl.$input
						.off("awesomplete-selectcomplete.salesPersonChange link-change.salesPersonChange change.salesPersonChange")
						.on("awesomplete-selectcomplete.salesPersonChange link-change.salesPersonChange change.salesPersonChange", handleChange);
				}

				const existingOnChange = ctrl.df.onchange;
				ctrl.df.onchange = async function () {
					if (typeof existingOnChange === "function") existingOnChange.call(this);
					await handleChange();
				};
			};

			wireNewOppSalesPersonControl();
			// Retry once after short delay in case control isn't fully ready
			setTimeout(wireNewOppSalesPersonControl, 300);

			wireAddressControl(me._newOppCustomerAddressControl, () => me.getNewOpportunityCustomerAddress(), "billing", "_billingAddressPreviewHooked");
			wireAddressControl(me._newOppShippingAddressControl, () => me.getNewOpportunityShippingAddress(), "shipping", "_shippingAddressPreviewHooked");
			wireAddressControl(me._newOppCompanyAddressControl, () => me.getNewOpportunityCompanyAddress(), "company", "_companyAddressPreviewHooked");
			wireTermsTemplateControl();
			wireTaxAndPaymentControls();
			syncAddressPreviews();
			renderTaxesPreview();
			renderPaymentTermsPreview();

			$scope
				.off("click", "#new-opp-cancel")
				.on("click", "#new-opp-cancel", function (e) {
					e.preventDefault();
					frappe.set_route(OPP_CFG.ROUTE);
				});

			$scope
				.off("click", "#new-opp-back")
				.on("click", "#new-opp-back", function (e) {
					e.preventDefault();
					const current = me._newOppCurrentStep || 1;
					if (current > 1) me.gotoNewWizardStep(current - 1);
				});

			$scope
				.off("click", "#new-opp-next")
				.on("click", "#new-opp-next", function (e) {
					e.preventDefault();
					const current = me._newOppCurrentStep || 1;
					if (current === 1) {
						const partyName = me.getNewOpportunityPartyName();
						const transactionDate = String($scope.find("#new-opp-transaction-date").val() || "").trim();
						const validTill = String($scope.find("#new-opp-valid-till").val() || "").trim();
						if (!partyName) {
							frappe.show_alert({ message: __("Please select a Customer before proceeding."), indicator: "red" }, 4);
							return;
						}
						if (!transactionDate) {
							frappe.show_alert({ message: __("Please set Transaction Date before proceeding."), indicator: "red" }, 4);
							return;
						}
						if (!validTill) {
							frappe.show_alert({ message: __("Please set Valid Till before proceeding."), indicator: "red" }, 4);
							return;
						}
						if (validTill < transactionDate) {
							frappe.show_alert({ message: __("Valid Till cannot be earlier than Transaction Date."), indicator: "red" }, 4);
							return;
						}
						const poRefNumber = me.getNewOpportunityPoRefNumber();
						if (!poRefNumber) {
							frappe.show_alert({ message: __("PO Ref Number is mandatory."), indicator: "red" }, 4);
							return;
						}
						const poAttachment = me.getNewOpportunityPoAttachment();
						if (!poAttachment) {
							frappe.show_alert({ message: __("PO Attachment is mandatory."), indicator: "red" }, 4);
							return;
						}
					}
					me.gotoNewWizardStep(current + 1);
				});

			$scope
				.off("click", ".new-opp-wizard-step")
				.on("click", ".new-opp-wizard-step", function (e) {
					e.preventDefault();
					const targetStep = parseInt($(this).data("step"), 10);
					if (!Number.isFinite(targetStep) || targetStep < 1) return;

					const totalSteps = $scope.find(".new-opp-wizard-step").length || 5;
					const safeStep = Math.min(Math.max(targetStep, 1), totalSteps);

					if (safeStep > 1) {
						const partyName = me.getNewOpportunityPartyName();
						if (!partyName) {
							frappe.show_alert({ message: __("Please select a Customer before proceeding."), indicator: "red" }, 4);
							return;
						}
					}

					me.gotoNewWizardStep(safeStep);
				});

			$scope
				.off("click", "#new-opp-save")
				.on("click", "#new-opp-save", async function (e) {
					e.preventDefault();

					const contactValidationPassed = await validateMinimumContacts();
					if (!contactValidationPassed) {
						return;
					}

					const partyName = me.getNewOpportunityPartyName();
					const salesStage = "Draft";
					const subject = ($scope.find("#new-opp-subject").val() || "").trim();
					const description = ($scope.find("#new-opp-description").val() || "").trim();
					const transactionDate = me.normalizeDateForDoc(
						$scope.find("#new-opp-transaction-date").val(),
						frappe.datetime.nowdate()
					);
					const validTill = me.normalizeDateForDoc(
						$scope.find("#new-opp-valid-till").val(),
						frappe.datetime.add_days(transactionDate, 7)
					);
					const opportunityOwner = frappe.session.user || "";
					const company = me.getNewOpportunityCompany();
					const poRefNumber = me.getNewOpportunityPoRefNumber();
					const poAttachment = me.getNewOpportunityPoAttachment();
					const shippingAddress = me.getNewOpportunityShippingAddress();
					const customerAddress = me.getNewOpportunityCustomerAddress() || shippingAddress;
					const companyAddress = me.getNewOpportunityCompanyAddress();

					// Fetch address display texts for all three address links in parallel
					const fetchAddressDisplay = async (addressName) => {
						if (!addressName) return "";
						try {
							const res = await frappe.call({
								method: "frappe.contacts.doctype.address.address.get_address_display",
								args: { address_dict: addressName },
							});
							const html = String(res?.message || "").trim();
							if (!html) return "";
							// Convert HTML to plain text: replace <br> variants with a space, strip remaining tags
							const $tmp = $("<div>").html(html);
							$tmp.find("br").replaceWith(" \n");
							return $tmp.text().replace(/\n{1,}/g, " \n").trim();
						} catch (e) {
							return "";
						}
					};

					const [customerAddressDisplay, shippingAddressDisplay, companyAddressDisplayText] = await Promise.all([
						fetchAddressDisplay(customerAddress),
						fetchAddressDisplay(shippingAddress),
						fetchAddressDisplay(companyAddress),
					]);

					const taxCategory = me.getNewOpportunityTaxCategory();
					if (company) {
						try {
							await computeTaxesPreviewData();
						} catch (e) {
							// no-op
						}
					}
					const taxTemplate = me.getNewOpportunityTaxTemplate();
					const paymentTermsTemplate = me.getNewOpportunityPaymentTermsTemplate();
					const termsTemplate = me.getNewOpportunityTermsTemplate();
					const primaryContact = me.getNewOpportunityContact();
					const salesTeamList = me.getNewOpportunitySalesTeam();
					const salesPerson = String(salesTeamList[0]?.sales_person || "").trim();
					const opportunityFrom = "Customer";
					const title = subject || [partyName || "Customer", frappe.datetime.nowdate()]
						.filter(Boolean)
						.join(" - ");

					const contactList = Array.from(new Set(
						(Array.isArray(me._newOppContactList) ? me._newOppContactList : [])
							.map((value) => String(value || "").trim())
							.filter(Boolean)
					));

					const resolveContactRows = async (contactIds = []) => {
						const uniqueIds = Array.from(new Set(
							(Array.isArray(contactIds) ? contactIds : [])
								.map((value) => String(value || "").trim())
								.filter(Boolean)
						));

						return Promise.all(uniqueIds.map(async (contactId) => {
							const cached = me._newOppContactMeta?.[contactId] || {};
							let fullName = String(cached.full_name || "").trim();
							let phone = String(cached.phone || "").trim();
							let email = String(cached.email || "").trim();
							let designation = String(cached.designation || cached.desgination || "").trim();
							const tpoc = Number(cached.tpoc || 0) === 1 ? 1 : 0;

							if (!fullName || !phone || !email || !designation) {
								try {
									const res = await frappe.db.get_value("Contact", contactId, [
										"full_name",
										"first_name",
										"last_name",
										"mobile_no",
										"phone",
										"email_id",
										"designation",
									]);
									const msg = res?.message || {};
									fullName = String(
										fullName
										|| msg.full_name
										|| [msg.first_name, msg.last_name].filter(Boolean).join(" ")
										|| contactId
									).trim();
									phone = String(phone || msg.mobile_no || msg.phone || "").trim();
									email = String(email || msg.email_id || "").trim();
									designation = String(designation || msg.designation || "").trim();
								} catch (e) {
									fullName = fullName || contactId;
								}
							}

							return {
								contact_id: contactId,
								full_name: fullName || contactId,
								phone,
								email,
								designation,
								tpoc,
							};
						}));
					};

					const itemRows = $scope
						.find("#new-opp-items-table-body tr.new-opp-item-main-row")
						.map((_, row) => {
							const $row = $(row);
							const manualValues = { ...($row.data("manualItemValues") || {}) };
							const stored = {
								...($row.data("sourceItemFields") || {}),
								...($row.data("extraItemFields") || {}),
								...manualValues,
							};
							const pickText = (selector, fallbackKey = "") => {
								const $field = $row.find(selector);
								const current = String($field.val() || "").trim();
								if (current) return current;
								return String(stored[fallbackKey] || "").trim();
							};
							const pickNumber = (selector, fallbackKey = "") => {
								const manualVal = manualValues[fallbackKey];
								if (manualVal !== undefined && manualVal !== null && manualVal !== "") {
									return parseNumber(manualVal);
								}
								const $field = $row.find(selector);
								const raw = String($field.val() || "").trim();
								if (raw) return parseNumber(raw);
								return parseNumber(stored[fallbackKey]);
							};
							const itemCodeControl = $row.data("itemCodeControl");
							const item_code = String((itemCodeControl?.get_value?.() || $row.find(".new-opp-item-code").val() || "")).trim();
							const item_name = pickText(".new-opp-item-name", "item_name");
							const qty = pickNumber(".new-opp-item-qty", "qty");
							const rate = pickNumber(".new-opp-item-rate", "rate");
							const amount = pickNumber(".new-opp-item-amount", "amount") || (qty * rate);
							const brand = pickText(".new-opp-item-brand", "brand");
							const item_group = pickText(".new-opp-item-group", "item_group");
							const description = pickText(".new-opp-item-description", "description");
							const hsncode = pickText(".new-opp-item-hsncode", "hsncode");
							const uom = pickText(".new-opp-item-uom", "uom");
							const opportunity_type = pickText(".new-opp-item-opportunity-type", "opportunity_type");
							const renewal_id = getRowRenewalId($row) || String(stored.renewal_id || "").trim();
							const orc = $row.find(".new-opp-item-orc").length ? ($row.find(".new-opp-item-orc").is(":checked") ? 1 : 0) : (Number(stored.orc || 0) ? 1 : 0);
							const commission_type = pickText(".new-opp-item-commission-type", "commission_type");
							const rate_value = pickNumber(".new-opp-item-rate-value", "rate_value");
							const source_opportunity = String(
								stored.opportunity
								|| stored.opportunity_name
								|| stored.parent
								|| stored.prevdoc_docname
								|| ""
							).trim();
							const source_detail_name = String(
								stored.name
								|| stored.opportunity_item
								|| stored.prevdoc_detail_docname
								|| ""
							).trim();
							const _extra_fields = { ...($row.data("extraItemFields") || {}) };
							if (!item_code) return null;
							return {
								item_code,
								item_name,
								rate,
								qty,
								amount,
								brand,
								item_group,
								description,
								hsncode,
								uom,
								opportunity_type,
								renewal_id,
								orc,
								commission_type,
								rate_value,
								source_opportunity,
								source_detail_name,
								_extra_fields,
							};
						})
						.get()
						.filter(Boolean);


					if (!partyName) {
						frappe.msgprint(__("Please fill Party"));
						return;
					}

					await frappe.model.with_doctype(OPP_CFG.DOCTYPE);
					const meta = frappe.get_meta(OPP_CFG.DOCTYPE);
					const hasField = (fieldname) => Boolean(meta?.fields?.some((df) => df.fieldname === fieldname));
					const getTableOptions = (fieldname) => {
						const df = meta?.fields?.find((entry) => entry.fieldname === fieldname && entry.fieldtype === "Table");
						return df?.options || "";
					};

					const doc = {
						doctype: OPP_CFG.DOCTYPE,
						[OPP_CFG.TITLE_FIELD]: title,
						opportunity_from: opportunityFrom,
						customer: partyName,
						customer: partyName,
					};

					const setParentFieldIfExists = (fieldCandidates, value) => {
						const normalizedValue = String(value || "").trim();
						if (!normalizedValue) return false;

						const candidates = Array.isArray(fieldCandidates) ? fieldCandidates : [fieldCandidates];
						for (const fieldname of candidates) {
							if (!fieldname || !hasField(fieldname)) continue;
							doc[fieldname] = normalizedValue;
							return true;
						}
						return false;
					};

					const buildQuotationTaxesFromTemplate = async (templateName) => {
						const normalizedTemplate = String(templateName || "").trim();
						if (!normalizedTemplate || !hasField("taxes")) return [];

						const taxChildDoctype = getTableOptions("taxes") || "Sales Taxes and Charges";
						await frappe.model.with_doctype(taxChildDoctype);
						const taxChildMeta = frappe.get_meta(taxChildDoctype);
						const hasTaxField = (fieldname) => Boolean(taxChildMeta?.fields?.some((df) => df.fieldname === fieldname));
						const setTaxField = (target, fieldCandidates, value) => {
							const candidates = Array.isArray(fieldCandidates) ? fieldCandidates : [fieldCandidates];
							for (const fieldname of candidates) {
								if (!fieldname || !hasTaxField(fieldname)) continue;
								target[fieldname] = value;
								return true;
							}
							return false;
						};

						try {
							const templateDoc = await frappe.db.get_doc("Sales Taxes and Charges Template", normalizedTemplate);
							const rows = Array.isArray(templateDoc?.taxes) ? templateDoc.taxes : [];
							return rows.map((row) => {
								const child = { doctype: taxChildDoctype };
								setTaxField(child, "charge_type", String(row?.charge_type || "On Net Total").trim() || "On Net Total");
								setTaxField(child, ["account_head", "account"], String(row?.account_head || row?.account || "").trim());
								setTaxField(child, ["description"], String(row?.description || "").trim());
								setTaxField(child, ["rate", "tax_rate"], Number(row?.rate || row?.tax_rate || 0) || 0);
								setTaxField(child, ["cost_center"], String(row?.cost_center || "").trim());
								setTaxField(child, ["included_in_print_rate"], Number(row?.included_in_print_rate || 0) ? 1 : 0);
								setTaxField(child, ["included_in_paid_amount"], Number(row?.included_in_paid_amount || 0) ? 1 : 0);
								setTaxField(child, ["row_id"], String(row?.row_id || "").trim());
								return Object.keys(child).length > 1 ? child : null;
							}).filter(Boolean);
						} catch (e) {
							console.warn("Unable to build quotation taxes from template:", e);
							return [];
						}
					};

					if (salesStage) doc[OPP_CFG.STATUS_FIELD] = salesStage;
					setParentFieldIfExists(["renewal_status", "opportunity_type", "custom_opportunity_type"], salesStage);
					if (subject && hasField("subject")) doc.subject = subject;
					if (description && hasField("description")) doc.description = description;
					if (description && !hasField("description") && hasField("remarks")) doc.remarks = description;
					if (transactionDate && hasField("transaction_date")) doc.transaction_date = transactionDate;
					if (validTill && hasField("valid_till")) doc.valid_till = validTill;
					if (opportunityOwner && hasField("opportunity_owner")) doc.opportunity_owner = opportunityOwner;
					if (company && hasField("company")) doc.company = company;
					if (company && hasField("company_name")) doc.company_name = company;
					if (poRefNumber && hasField("po_ref_number")) doc.po_ref_number = poRefNumber;
					if (poAttachment && hasField("custom_po_attachment")) doc.custom_po_attachment = poAttachment;
					if (hasField("custom_po_attachment")) doc.custom_po_attachment = poAttachment || "";
					if (customerAddress && hasField("customer_address")) doc.customer_address = customerAddress;
					if (customerAddressDisplay && hasField("address")) doc.address = customerAddressDisplay;
					if (shippingAddress && hasField("shipping_address_name")) doc.shipping_address_name = shippingAddress;
					if (shippingAddressDisplay && hasField("shipping_address")) doc.shipping_address = shippingAddressDisplay;
					if (companyAddress && hasField("company_address")) doc.company_address = companyAddress;
					if (companyAddressDisplayText && hasField("company_address_display")) doc.company_address_display = companyAddressDisplayText;
					if (taxCategory && hasField("tax_category")) doc.tax_category = taxCategory;
					if (taxTemplate && hasField("taxes_and_charges")) doc.taxes_and_charges = taxTemplate;
					if (paymentTermsTemplate && hasField("payment_terms_template")) {
						doc.payment_terms_template = paymentTermsTemplate;
						// Fetch and populate payment schedule
						try {
							const paymentTermsResponse = await frappe.call({
								method: "erpnext.controllers.accounts_controller.get_payment_terms",
								args: {
									terms_template: paymentTermsTemplate,
									posting_date: doc.transaction_date || frappe.datetime.get_today(),
									grand_total: doc.grand_total || 0,
									bill_date: doc.transaction_date || frappe.datetime.get_today(),
								},
							});
							if (paymentTermsResponse?.message && Array.isArray(paymentTermsResponse.message)) {
								doc.payment_schedule = paymentTermsResponse.message;
							}
						} catch (e) {
							console.warn("Failed to fetch payment terms:", e);
						}
					}
					if (termsTemplate && hasField("tc_name")) doc.tc_name = termsTemplate;
					const termsAndConditionsHtml = ($scope.find("#new-opp-terms-and-conditions").html() || "").trim();
					if (termsAndConditionsHtml && hasField("terms")) doc.terms = termsAndConditionsHtml;
					if (me._newOppGrandTotal && hasField("grand_total")) doc.grand_total = me._newOppGrandTotal;
					if (me._newOppRoundedTotal && hasField("rounded_total")) doc.rounded_total = me._newOppRoundedTotal;
					if (me._newOppInWords && hasField("in_words")) doc.in_words = me._newOppInWords;
					const sourceOpportunityFromItems = String(
						(itemRows.find((row) => String(row?.source_opportunity || "").trim())?.source_opportunity) || ""
					).trim();
					const quotationIdFromField = String($scope.find("#new-opp-quotation-id").val() || "").trim();
					const sourceOpportunityName = String(
						me._newOppSourceOpportunity
						|| me._currentOpportunityName
						|| sourceOpportunityFromItems
						|| quotationIdFromField
						|| ""
					).trim();
					const sourceDoctype = me._newOppSourceDoctype || "Quotation";

					if ((sourceDoctype === "Quotation" && sourceOpportunityName && hasField("quotation_id")) ||
						(quotationIdFromField && hasField("quotation_id"))) {
						doc.quotation_id = sourceOpportunityName || quotationIdFromField;
					}

					if (hasField("opportunity") && !String(doc.opportunity || "").trim() && sourceOpportunityName) {
						doc.opportunity = sourceOpportunityName;
					}

					if (hasField("prevdoc_docname") && !String(doc.prevdoc_docname || "").trim()) {
						doc.prevdoc_docname = String(doc.opportunity || sourceOpportunityName || partyName || "").trim();
					}

					if (hasField("payment_terms_template") && !String(doc.payment_terms_template || "").trim()) {
						const customerNameForTerms = String(partyName || "").trim();
						if (customerNameForTerms) {
							try {
								const customerDoc = await frappe.db.get_doc("Customer", customerNameForTerms);
								const fallbackTemplate = String(
									customerDoc?.payment_terms_template
									|| customerDoc?.default_payment_terms_template
									|| customerDoc?.payment_terms
									|| ""
								).trim();
								if (fallbackTemplate) {
									doc.payment_terms_template = fallbackTemplate;
									me.setNewOpportunityPaymentTermsTemplate(fallbackTemplate);
								}
							} catch (e) {
								// no-op
							}
						}
					}

					if (hasField("payment_terms_template") && !String(doc.payment_terms_template || "").trim()) {
						frappe.msgprint(__("Payment Terms Template is mandatory. Please select Payment Terms Template in Step 5."));
						return;
					}

					if (taxTemplate) {
						const taxRows = await buildQuotationTaxesFromTemplate(taxTemplate);
						if (taxRows.length) {
							doc.taxes = taxRows;
						}
					}

					if (hasField("opportunity") && !String(doc.opportunity || "").trim()) {
						frappe.msgprint(__("Opportunity is mandatory. Please create this quotation from an Opportunity context."));
						return;
					}

					const uniqueContacts = Array.from(new Set(contactList));
					const contactDetails = await resolveContactRows(uniqueContacts);
					const selectedContact = contactDetails.find((entry) => entry.contact_id === String(primaryContact || "").trim());
					const tpocContact = contactDetails.find((entry) => Number(entry.tpoc || 0) === 1);
					const finalPrimaryContact = selectedContact || tpocContact || contactDetails[0] || null;

					if (finalPrimaryContact?.contact_id) {
						setParentFieldIfExists("contact_person", finalPrimaryContact.contact_id);
						setParentFieldIfExists(["contact_email", "email_id", "email"], finalPrimaryContact.email);
						setParentFieldIfExists(["contact_mobile", "mobile_no", "phone", "phone_no"], finalPrimaryContact.phone);
					}

					const contactTableField =
						meta?.fields?.find((df) => df.fieldtype === "Table" && df.fieldname === "contact_list")
						|| meta?.fields?.find((df) => df.fieldtype === "Table" && df.fieldname === "contacts")
						|| meta?.fields?.find((df) => df.fieldtype === "Table" && /(contact|party_contact)/i.test(df.fieldname || ""));

					if (contactDetails.length && contactTableField) {
						const childDoctype = contactTableField.options || "Renewal Contacts";
						await frappe.model.with_doctype(childDoctype);
						const childMeta = frappe.get_meta(childDoctype);
						const childFieldCandidates = ["contact", "contact_person", "contact_name", "party_contact", "name1", "user_name"];
						const childFieldname = childFieldCandidates.find((fieldname) =>
							childMeta?.fields?.some((df) => df.fieldname === fieldname)
						);

						const hasChildField = (fieldname) => Boolean(childMeta?.fields?.some((df) => df.fieldname === fieldname));
						const setChildField = (target, fieldCandidates, value) => {
							const candidates = Array.isArray(fieldCandidates) ? fieldCandidates : [fieldCandidates];
							for (const fieldname of candidates) {
								if (!fieldname || !hasChildField(fieldname)) continue;
								target[fieldname] = value;
								return true;
							}
							return false;
						};

						if (childFieldname || hasChildField("user_name")) {
							doc[contactTableField.fieldname] = contactDetails.map((entry) => {
								const child = {
									doctype: childDoctype,
								};

								if (childFieldname) {
									child[childFieldname] = childFieldname === "user_name"
										? (entry.contact_id || "")
										: entry.contact_id;
								}

								setChildField(child, "user_name", entry.contact_id || "");
								setChildField(child, ["full_name", "contact_name", "person_name"], entry.full_name || "");
								setChildField(child, ["email_id", "contact_email", "email"], entry.email || "");
								setChildField(child, ["mobile_no", "contact_mobile", "phone", "phone_no"], entry.phone || "");
								setChildField(child, ["designation", "desgination"], entry.designation || "");
								setChildField(child, ["tpoc", "is_tpoc", "is_primary_contact", "is_primary"], Number(entry.tpoc || 0) === 1 ? 1 : 0);
								return child;
							});
						}
					}

					// Fetch sales_team from customer if not already set
					if (!salesTeamList.length && partyName) {
						try {
							const customerDoc = await frappe.db.get_doc("Customer", partyName);
							const customerSalesTeam = Array.isArray(customerDoc?.sales_team) ? customerDoc.sales_team : [];
							console.log("Fetched sales_team from customer:", customerSalesTeam);
							if (customerSalesTeam.length) {
								salesTeamList = customerSalesTeam.map((row) => {
									const salesPerson = String(row?.sales_person || row?.sales_person_name || "").trim();
									if (!salesPerson) return null;
									return {
										sales_person: salesPerson,
										mobile_no: String(row?.mobile_no || row?.mobile || row?.contact_mobile || row?.phone || "").trim(),
										email_id: String(row?.email_id || row?.email || row?.contact_email || "").trim(),
										allocated_percentage: Number(row?.allocated_percentage || row?.allocation_percentage || row?.allocated || 100) || 100,
									};
								}).filter((entry) => entry.sales_person);
								console.log("Mapped salesTeamList from customer:", salesTeamList);
							}
						} catch (e) {
							console.warn("Failed to fetch sales_team from customer:", e);
						}
					}

					console.log("Final salesTeamList:", salesTeamList);

					if (salesTeamList.length) {
						const salesChildDoctype = getTableOptions("sales_team") || "Customer Order Form Sales Team";
						await frappe.model.with_doctype(salesChildDoctype);
						const salesChildMeta = frappe.get_meta(salesChildDoctype);
						const hasSalesField = (fieldname) => Boolean(salesChildMeta?.fields?.some((df) => df.fieldname === fieldname));
						const setSalesField = (target, fieldCandidates, value) => {
							const candidates = Array.isArray(fieldCandidates) ? fieldCandidates : [fieldCandidates];
							for (const fieldname of candidates) {
								if (!fieldname || !hasSalesField(fieldname)) continue;
								target[fieldname] = value;
								return true;
							}
							return false;
						};

						doc.sales_team = salesTeamList.map((entry) => {
							const salesPersonValue = String(entry?.sales_person || "").trim();
							if (!salesPersonValue) return null;

							const allocated = Number(entry?.allocated_percentage || 100) || 100;
							const child = {
								doctype: salesChildDoctype,
							};

							setSalesField(child, ["sales_person", "sales_person_name"], salesPersonValue);
							setSalesField(child, ["mobile_no", "mobile", "contact_mobile", "phone"], String(entry?.mobile_no || "").trim());
							setSalesField(child, ["email_id", "contact_email", "email"], String(entry?.email_id || "").trim());
							setSalesField(child, ["allocated_percentage", "allocation_percentage", "allocated", "contribution_percentage"], allocated);
							return child;
						}).filter(Boolean);

						if (doc.sales_team.length) {
							setParentFieldIfExists(["sales_person"], String(doc.sales_team[0]?.sales_person || "").trim());
							setParentFieldIfExists(["team_name"], doc.sales_team
								.map((entry) => String(entry?.sales_person || "").trim())
								.filter(Boolean)
								.join(", "));
						}
					}

					if (itemRows.length && hasField("items")) {
						const itemChildDoctype = getTableOptions("items") || "Opportunity Item";
						await frappe.model.with_doctype(itemChildDoctype);
						const itemMeta = frappe.get_meta(itemChildDoctype);
						const hasItemField = (fieldname) => Boolean(itemMeta?.fields?.some((df) => df.fieldname === fieldname));

						const setIfField = (target, fieldCandidates, value) => {
							const candidates = Array.isArray(fieldCandidates) ? fieldCandidates : [fieldCandidates];
							for (const fieldname of candidates) {
								if (!fieldname || !hasItemField(fieldname)) continue;
								target[fieldname] = value;
								return true;
							}
							return false;
						};

						doc.items = itemRows.map((row) => {
							const rowSourceOpportunity = String(row?.source_opportunity || sourceOpportunityName || "").trim();
							const rowSourceDetailName = String(row?.source_detail_name || "").trim();
							const itemName = String(row?.item_name || row?.item_code || "").trim();
							const child = {
								doctype: itemChildDoctype,
								item_code: row.item_code,
								qty: row.qty,
								rate: row.rate,
								amount: row.amount,
								conversion_factor: 1,
							};

							setIfField(child, "item_name", itemName);
							setIfField(child, "brand", row.brand);
							setIfField(child, "item_group", row.item_group);
							setIfField(child, "description", row.description || itemName);
							setIfField(child, ["hsncode", "hsn_code", "gst_hsn_code"], row.hsncode);
							setIfField(child, ["uom", "stock_uom"], row.uom);
							setIfField(child, ["renewal_status", "opportunity_type", "custom_opportunity_type"], row.opportunity_type);
							setIfField(child, "renewal_id", row.renewal_id);
							setIfField(child, "orc", row.orc);
							setIfField(child, "commission_type", row.commission_type);
							setIfField(child, "rate_value", row.rate_value);
							setIfField(child, ["opportunity", "against_opportunity"], rowSourceOpportunity);
							setIfField(child, "prevdoc_doctype", me._newOppSourceDoctype || "Quotation");
							setIfField(child, "prevdoc_docname", rowSourceOpportunity);
							setIfField(child, ["prevdoc_detail_docname", "opportunity_item"], rowSourceDetailName);

							Object.entries(row._extra_fields || {}).forEach(([fieldname, value]) => {
								if (!fieldname || !hasItemField(fieldname)) return;
								if (Object.prototype.hasOwnProperty.call(child, fieldname)) return;
								child[fieldname] = value;
							});
							return child;
						});
					}

					const $saveBtn = $scope.find("#new-opp-save");
					const originalLabel = $saveBtn.text();
					$saveBtn.prop("disabled", true).text("Creating...");

					try {
						const response = await frappe.call({
							method: "frappe.client.insert",
							args: { doc },
						});

						const message = response?.message;
						const insertedName = String(
							(typeof message === "string" && message)
							|| message?.name
							|| message?.docname
							|| message?.docs?.[0]?.name
							|| ""
						).trim();

						frappe.show_alert({ message: __("Customer Order Form created"), indicator: "green" });

						if (insertedName) {
							frappe.set_route(OPP_CFG.ROUTE, insertedName);
						} else {
							frappe.set_route(OPP_CFG.ROUTE);
						}
					} catch (e) {
						const backendMessage = String(e?.message || "").trim();
						frappe.msgprint(
							backendMessage
								? __("Failed to create Customer Order Form: {0}", [backendMessage])
								: __("Failed to create Customer Order Form. Please try again.")
						);
						$saveBtn.prop("disabled", false).text(originalLabel);
					}
				});

			refreshNewOppItemsVisibility();

			$scope
				.off("change", "#new-opp-transaction-date")
				.on("change", "#new-opp-transaction-date", function () {
					const txDate = String($(this).val() || "").trim();
					if (!txDate) return;
					if (me._newOppValidTillManuallyChanged) return;
					$scope.find("#new-opp-valid-till").val(frappe.datetime.add_days(txDate, 7));
					renderPaymentTermsPreview();
				});

			$scope
				.off("change", "#new-opp-valid-till")
				.on("change", "#new-opp-valid-till", function () {
					const current = String($(this).val() || "").trim();
					const txDate = String($scope.find("#new-opp-transaction-date").val() || "").trim();
					if (!current || !txDate) return;
					const defaultValidTill = frappe.datetime.add_days(txDate, 7);
					me._newOppValidTillManuallyChanged = current !== defaultValidTill;
				});
		}

		openNewOppItemWizardInline(presetOpportunityType = null, editItemData = null) {
			const me = this;
			const $scope = this.getPageScope();
			this._inlineWizardSessionCounter = Number(this._inlineWizardSessionCounter || 0) + 1;
			const wizardSessionId = this._inlineWizardSessionCounter;
			this._activeInlineWizardSessionId = wizardSessionId;
			const isSessionActive = () => this._activeInlineWizardSessionId === wizardSessionId;
			const inDetailView = $scope.find(".customer-order-forms-details:visible, .quotation-list-details:visible").length > 0;
			const $section = inDetailView
				? $scope.find("#detail-item-wizard-inline-section")
				: $scope.find("#new-opp-item-wizard-inline-section");
			const $body = inDetailView
				? $scope.find("#detail-item-wizard-inline-body")
				: $scope.find("#new-opp-item-wizard-inline-body");
			const normalizeOpportunityType = (value) => {
				const normalized = String(value || "").trim();
				return ["Renewal", "Additional"].includes(normalized) ? normalized : "New";
			};

			if (!$section.length || !$body.length) {
				frappe.msgprint(__("Inline item wizard container is not available."));
				return;
			}

			if (this._newOppItemWizardOpen) {
				if (editItemData || presetOpportunityType) {
					this._activeInlineWizardSessionId = null;
					$body.off(".newOppInlineWizard");
					$body.empty();
					$section.addClass("d-none");
					this._newOppItemWizardOpen = false;
					return this.openNewOppItemWizardInline(presetOpportunityType, editItemData);
				}
				if (inDetailView && editItemData) {
					this.setActiveDetailItemHighlight(editItemData?._editRowName, editItemData?._editRowIdx);
				}
				if (!inDetailView && editItemData?._rowElement) {
					this.setActiveNewOppRowHighlight(editItemData._rowElement);
				}
				$section.removeClass("d-none");
				return;
			}

			this._newOppItemWizardOpen = true;
			const isEditMode = Boolean(editItemData);
			if (inDetailView && isEditMode) {
				this.setActiveDetailItemHighlight(editItemData?._editRowName, editItemData?._editRowIdx);
			}
			if (!inDetailView && isEditMode && editItemData?._rowElement) {
				this.setActiveNewOppRowHighlight(editItemData._rowElement);
			}
			let currentWizardStep = isEditMode ? 2 : 1;
			let itemCodeControl = null;
			let renewalControl = null;
			let suppressRenewalControlChange = false;

			let itemData = {
				opportunity_type: normalizeOpportunityType(presetOpportunityType),
				item_code: "",
				item_name: "",
				qty: 1,
				rate: 0,
				amount: 0,
				brand: "",
				item_group: "",
				description: "",
				hsncode: "",
				spq_rate: 0,
				spq_amount: 0,
				margin: 0,
				uom: "",
				supplier: "",
				forecast: "Include",
				renewal_id: "",
				sales_stage: "Initial Analysis",
				expected_date: frappe.datetime.nowdate(),
				orc: 0,
				commission_type: "",
				rate_value: 0,
				_editRowElement: editItemData?._rowElement,
			};

			if (isEditMode) {
				Object.assign(itemData, editItemData);
				itemData.opportunity_type = normalizeOpportunityType(itemData.opportunity_type);
				// Keep original HTML so the rich text editor can render it properly
				itemData.description = itemData.description || itemData.description_html || "";
			}

			const isRenewalLikeType = () => ["Renewal", "Additional"].includes(normalizeOpportunityType(itemData.opportunity_type));

			const updateItemCalculations = () => {
				const qty = Number(itemData.qty || 1);
				const rate = Number(itemData.rate || 0);
				itemData.amount = qty * rate;
			};

			const toPlainText = (value) => {
				const raw = String(value ?? "");
				if (!raw) return "";

				const $root = $("<div>").html(raw);
				$root.find("br").replaceWith("\n");
				$root.find("li").each(function () {
					const text = $(this).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
					$(this).replaceWith(text ? `\n• ${text}` : "");
				});
				$root.find("p, div, section, article, tr").each(function () {
					if ($(this).find("li").length) return;
					$(this).append("\n");
				});

				return $root
					.text()
					.replace(/\u00a0/g, " ")
					.replace(/[ \t]+\n/g, "\n")
					.replace(/\n[ \t]+/g, "\n")
					.replace(/\n{3,}/g, "\n\n")
					.trim();
			};

			const getDescriptionPreviewText = (value, maxLength = 180) => {
				const text = String(value || "").trim();
				if (!text) return "No description";
				if (text.length <= maxLength) return text;
				return `${text.slice(0, maxLength).trimEnd()}...`;
			};

			const syncInlineFormData = () => {
				const $root = $body;
				itemData.opportunity_type = normalizeOpportunityType(itemData.opportunity_type);
				const qtyVal = Number($root.find("#inline-wizard-qty").val());
				itemData.qty = Number.isFinite(qtyVal) && qtyVal > 0 ? qtyVal : 1;
				itemData.rate = Number($root.find("#inline-wizard-rate").val()) || 0;
				itemData.orc = $root.find("#inline-wizard-orc").is(":checked") ? 1 : 0;
				itemData.commission_type = String($root.find("#inline-wizard-commission-type").val() || "").trim();
				itemData.rate_value = Number($root.find("#inline-wizard-rate-value").val()) || 0;
				itemData.description = String($root.find("#inline-wizard-description").val() || "").trim();
				itemData.renewal_id = String((renewalControl?.get_value?.() || itemData.renewal_id || "")).trim();

				const selectedItemCode = String(itemCodeControl?.get_value?.() || itemData.item_code || "").trim();
				if (selectedItemCode) itemData.item_code = selectedItemCode;

				updateItemCalculations();
			};

			const closeInlineWizard = () => {
				$body.off(".newOppInlineWizard");
				$body.empty();
				$section.addClass("d-none");
				itemCodeControl = null;
				renewalControl = null;
				if (inDetailView && isEditMode) {
					me.clearActiveDetailItemHighlight();
				}
				if (!inDetailView && isEditMode) {
					me.clearActiveNewOppRowHighlight();
				}
				if (isSessionActive()) {
					me._activeInlineWizardSessionId = null;
				}
				me._newOppItemWizardOpen = false;
			};

			const ensureItemCodeControl = () => {
				const $host = $body.find("#inline-wizard-item-code-control");
				if (!$host.length || !frappe?.ui?.form?.make_control) return;

				$host.empty();
				itemCodeControl = frappe.ui.form.make_control({
					parent: $host,
					only_input: true,
					df: {
						fieldtype: "Link",
						fieldname: "inline_wizard_item_code",
						options: "Item",
						label: "",
						placeholder: __("Select Item"),
						get_query: () => ({ filters: { disabled: 0 } }),
						onchange: async () => {
							if (!isSessionActive()) return;
							const code = String(itemCodeControl?.get_value?.() || "").trim();
							if (!code) return;
							const isNewItem = code !== itemData.item_code;
							const meta = await me.getItemAutofill(code);
							if (!isSessionActive()) return;
							if (!meta) return;
							itemData.item_code = code;
							itemData.item_name = meta.item_name || code;
							itemData.brand = meta.brand || "";
							itemData.item_group = meta.item_group || "";
							itemData.description_html = String(meta.description_html || meta.description || "");
							if (isNewItem) {
								itemData.description = String(toPlainText(itemData.description_html) || "").trim();
								itemData.rate = Number(meta.rate || 0);
							}
							itemData.uom = meta.uom || "";
							itemData.hsncode = meta.hsncode || "";
							refreshInlineItemMetaFields();
						}
					},
					render_input: true,
				});
				$host.data("control", itemCodeControl);

				const applyInlineAutofillFromControl = async () => {
					if (!isSessionActive()) return;
					const selectedCode = String(itemCodeControl?.get_value?.() || itemCodeControl?.$input?.val?.() || "").trim();
					if (!selectedCode || selectedCode === itemData.item_code) return;

					const meta = await me.getItemAutofill(selectedCode);
					if (!isSessionActive()) return;
					if (!meta) return;

					itemData.item_code = selectedCode;
					itemData.item_name = meta.item_name || selectedCode;
					itemData.brand = meta.brand || "";
					itemData.item_group = meta.item_group || "";
					itemData.description_html = String(meta.description_html || meta.description || "");
					itemData.description = String(toPlainText(itemData.description_html) || "").trim();
					itemData.uom = meta.uom || "";
					itemData.hsncode = meta.hsncode || "";
					itemData.rate = Number(meta.rate || 0);
					updateItemCalculations();
					refreshInlineItemMetaFields();
				};

				if (itemData.item_code) itemCodeControl.set_value(itemData.item_code);
				me.configureItemAdvancedSearch(itemCodeControl);
				me.attachInlineLinkPortal(itemCodeControl);
				itemCodeControl.$input
					?.off("awesomplete-selectcomplete.inlineWizard change.inlineWizard blur.inlineWizard")
					?.on("awesomplete-selectcomplete.inlineWizard change.inlineWizard blur.inlineWizard", () => {
						setTimeout(() => {
							applyInlineAutofillFromControl();
						}, 60);
					});
			};

			const ensureRenewalControl = () => {
				const $renewalHost = $body.find("#inline-wizard-renewal-id-control");
				if (!$renewalHost.length || !frappe?.ui?.form?.make_control) {
					renewalControl = null;
					return;
				}

				if (!isRenewalLikeType()) {
					$renewalHost.empty();
					renewalControl = null;
					return;
				}

				$renewalHost.empty();
				renewalControl = frappe.ui.form.make_control({
					parent: $renewalHost,
					only_input: true,
					df: {
						fieldtype: "Link",
						fieldname: "inline_wizard_renewal_id",
						options: me._newOppRenewalDoctype || "Renewal List",
						label: "",
						placeholder: __("Select Renewal ID"),
						get_query: () => {
							const customerName = String(me.getNewOpportunityPartyName() || "").trim();
							const customerField = String(me._newOppRenewalCustomerFilterField || "").trim();
							if (!customerName || !customerField) return {};
							return { filters: { [customerField]: customerName } };
						},
						onchange: async () => {
							if (!isSessionActive()) return;
							if (suppressRenewalControlChange) return;
							itemData.renewal_id = String(renewalControl?.get_value?.() || "").trim();
							if (!itemData.renewal_id) return;
							try {
								const renewalDoctype = String(renewalControl?.df?.options || "Renewal List").trim() || "Renewal List";
								const renewalDoc = await frappe.db.get_doc(renewalDoctype, itemData.renewal_id);
								if (!isSessionActive()) return;
								const preset = await me.extractRenewalItemPreset(
									renewalDoc,
									itemData.renewal_id,
									String(itemData.opportunity_type || "Renewal").trim() || "Renewal"
								);
								if (!isSessionActive()) return;
								if (preset?.item_code) {
									Object.assign(itemData, {
										...preset,
										opportunity_type: String(itemData.opportunity_type || preset.opportunity_type || "Renewal").trim(),
									});
									refreshInlineItemMetaFields();
								}
							} catch (e) {
								frappe.msgprint(__("Unable to fetch selected renewal."));
							}
						},
					},
					render_input: true,
				});
				if (itemData.renewal_id) {
					suppressRenewalControlChange = true;
					renewalControl.set_value(itemData.renewal_id);
					setTimeout(() => {
						suppressRenewalControlChange = false;
					}, 0);
				}
				me.attachInlineLinkPortal(renewalControl);
			};

			const getSubmitPayload = () => {
				syncInlineFormData();
				const payload = {
					...itemData,
					opportunity_type: normalizeOpportunityType(itemData.opportunity_type),
					item_code: String(itemData.item_code || "").trim(),
					item_name: String(itemData.item_name || "").trim(),
					qty: Number(itemData.qty || 1),
					rate: Number(itemData.rate || 0),
					renewal_id: String(itemData.renewal_id || "").trim(),
					description: String(itemData.description || "").trim(),
					commission_type: String(itemData.commission_type || "").trim(),
					rate_value: Number(itemData.rate_value || 0),
					orc: Number(itemData.orc || 0) ? 1 : 0,
				};

				payload.amount = Number(payload.qty * payload.rate);
				return payload;
			};

			const refreshInlineComputedFields = () => {
				if (!isSessionActive()) return;
				const $amount = $body.find("#inline-wizard-amount");
				if ($amount.length) $amount.val(fmtCurrency(itemData.amount));
			};

			const toggleInlineOrcFields = () => {
				if (!isSessionActive()) return;
				const shouldShow = Boolean(itemData.orc);
				$body.find("#inline-wizard-commission-field, #inline-wizard-rate-value-field").toggleClass("d-none", !shouldShow);
			};

			const setFieldReadonly = (selector, readonly = true) => {
				$body.find(selector).prop("readonly", readonly);
			};

			const refreshInlineItemMetaFields = () => {
				if (!isSessionActive()) return;
				const escapedItemName = frappe.utils.escape_html(itemData.item_name || "");
				const $itemNameDisplay = $body.find(".new-opp-display-value");
				if ($itemNameDisplay.length) {
					$itemNameDisplay.text(escapedItemName || "-").attr("title", escapedItemName);
				}

				const $rateField = $body.find("#inline-wizard-rate");
				if ($rateField.length) {
					$rateField.val(itemData.rate ?? 0);
				}

				const $descField = $body.find("#inline-wizard-description");
				if ($descField.length) {
					$descField.val(String(itemData.description || "").trim());
				}

				if (renewalControl && itemData.renewal_id) {
					suppressRenewalControlChange = true;
					renewalControl.set_value(itemData.renewal_id);
					setTimeout(() => { suppressRenewalControlChange = false; }, 0);
				}

				const $descDisplay = $body.find(".new-opp-item-description-preview");
				if ($descDisplay.length) {
					const desc = getDescriptionPreviewText(itemData.description || "");
					$descDisplay.text(desc).attr("title", itemData.description || "");
				}

				refreshInlineComputedFields();
			};

			const renderInlineWizard = () => {
				if (!isSessionActive()) return;
				$section.removeClass("d-none");

				const escapedItemName = frappe.utils.escape_html(itemData.item_name || "");
				const showStep1 = !isEditMode;
				const panel1Class = currentWizardStep === 1 && showStep1 ? "" : "d-none";
				const panel2Class = currentWizardStep === 2 ? "" : "d-none";
				const panel3Class = currentWizardStep === 3 ? "" : "d-none";
				const renewalRowClass = isRenewalLikeType() ? "" : "d-none";
				const orcClass = itemData.orc ? "" : "d-none";

				$body.html(`
				<div class="new-opp-item-wizard-inline-stepper">
					<div class="new-opp-item-wizard-inline-step ${showStep1 ? "" : "d-none"} ${currentWizardStep === 1 ? "is-active" : ""} ${currentWizardStep > 1 ? "is-done" : ""}"><span class="dot">1</span><span>Type</span></div>
					<div class="new-opp-item-wizard-inline-step ${currentWizardStep === 2 ? "is-active" : ""} ${currentWizardStep > 2 ? "is-done" : ""}"><span class="dot">${showStep1 ? "2" : "1"}</span><span>Basic</span></div>
					<div class="new-opp-item-wizard-inline-step ${currentWizardStep === 3 ? "is-active" : ""}"><span class="dot">${showStep1 ? "3" : "2"}</span><span>Details</span></div>
				</div>

				<div class="${panel1Class}" data-inline-panel="1">
					<div class="new-opp-inline-type-grid">
						<div class="new-opp-inline-type-card ${itemData.opportunity_type === "New" ? "is-selected" : ""}" data-type="New">
							<div class="type-title">Add Row</div>
							<div class="type-subtitle">Create a brand new line item</div>
						</div>
						<div class="new-opp-inline-type-card ${itemData.opportunity_type === "Renewal" ? "is-selected" : ""}" data-type="Renewal">
							<div class="type-title">Add Renewal</div>
							<div class="type-subtitle">Pick from existing renewal record</div>
						</div>
						<div class="new-opp-inline-type-card ${itemData.opportunity_type === "Additional" ? "is-selected" : ""}" data-type="Additional">
							<div class="type-title">Add Additional</div>
							<div class="type-subtitle">Add-on item linked to renewal</div>
						</div>
					</div>
				</div>

				<div class="${panel2Class}" data-inline-panel="2">
					<div class="new-opp-row two-col">
						<div class="new-opp-field">
							<label>Item Code <span style="color:#eb9091">*</span></label>
							<div id="inline-wizard-item-code-control" class="new-opp-link-control"></div>
						</div>
						<div class="new-opp-field">
							<label>Item Name</label>
							<div class="new-opp-display-value" title="${escapedItemName}" style="font-weight: 500; color: #333; padding: 8px; background: #f8f9fa; border-radius: 4px;">${escapedItemName || "-"}</div>
						</div>
					</div>
					<div class="new-opp-row four-col">
						<div class="new-opp-field"><label>Qty <span style="color:#eb9091">*</span></label><input id="inline-wizard-qty" type="number" min="1" step="any" class="form-control" value="${itemData.qty ?? 1}"></div>
						<div class="new-opp-field"><label>Rate <span style="color:#eb9091">*</span></label><input id="inline-wizard-rate" type="number" min="0" step="0.01" class="form-control" value="${itemData.rate ?? 0}"></div>
						<div class="new-opp-field"><label>Amount</label><input id="inline-wizard-amount" type="text" readonly class="form-control" value="${fmtCurrency(itemData.amount)}"></div>
						<div class="new-opp-field ${renewalRowClass}"><label>Renewal ID</label><div id="inline-wizard-renewal-id-control" class="new-opp-link-control"></div></div>
					</div>
				</div>

				<div class="${panel3Class}" data-inline-panel="3">
					<div class="new-opp-row three-col">
						<div class="new-opp-field"><label>ORC</label><div><input id="inline-wizard-orc" type="checkbox" ${itemData.orc ? "checked" : ""}> Enable ORC</div></div>
						<div id="inline-wizard-commission-field" class="new-opp-field ${orcClass}"><label>Commission Type</label><select id="inline-wizard-commission-type" class="form-control"><option value="" ${itemData.commission_type === "" ? "selected" : ""}>Select</option><option value="Unit Rate" ${itemData.commission_type === "Unit Rate" ? "selected" : ""}>Unit Rate</option><option value="Value" ${itemData.commission_type === "Value" ? "selected" : ""}>Value</option></select></div>
						<div id="inline-wizard-rate-value-field" class="new-opp-field ${orcClass}"><label>Rate Value</label><input id="inline-wizard-rate-value" type="number" min="0" step="0.01" class="form-control" value="${itemData.rate_value ?? 0}"></div>
					</div>
					<div class="new-opp-row one-col"><div class="new-opp-field"><label>Description</label><textarea id="inline-wizard-description" rows="3" class="form-control">${frappe.utils.escape_html(itemData.description || "")}</textarea></div></div>
				</div>

				<div class="new-opp-item-wizard-inline-actions">
					<button type="button" class="btn btn-default" id="inline-wizard-cancel">Cancel</button>
					<div class="new-opp-item-wizard-inline-actions-right">
						<button type="button" class="btn btn-default ${currentWizardStep <= 1 ? "d-none" : ""}" id="inline-wizard-back">Back</button>
						<button type="button" class="btn btn-primary1 ${currentWizardStep >= 3 ? "d-none" : ""}" id="inline-wizard-next">Next</button>
						<button type="button" class="btn btn-primary1 ${currentWizardStep < 3 ? "d-none" : ""}" id="inline-wizard-save">${isEditMode ? "Update Item" : "Add Item"}</button>
					</div>
				</div>
			`);

				ensureItemCodeControl();
				ensureRenewalControl();

				$body
					.off(".newOppInlineWizard")
					.on("click.newOppInlineWizard", ".new-opp-inline-type-card", async function () {
						if (!isSessionActive()) return;
						const nextType = normalizeOpportunityType($(this).data("type") || "New");
						const previousData = { ...itemData };
						itemData.opportunity_type = nextType;

						if (nextType === "New") {
							itemData.renewal_id = "";
						}

						if (!isEditMode) {
							currentWizardStep = 2;
						}

						renderInlineWizard();

						setTimeout(async () => {
							if (!isSessionActive()) return;
							if (nextType === "New") {
								const control = $body.find("#inline-wizard-item-code-control").data("control") || itemCodeControl;
								if (control?.open_advanced_search) {
									control.open_advanced_search();
								}
								return;
							}

							const loaded = await me.loadPresetForWizard(nextType, itemData);
							if (!isSessionActive()) return;
							if (!loaded) {
								itemData = { ...previousData };
								if (!isEditMode) currentWizardStep = 1;
								renderInlineWizard();
								return;
							}

							currentWizardStep = 2;
							renderInlineWizard();
						}, 120);
					})
					.on("input.newOppInlineWizard change.newOppInlineWizard", "#inline-wizard-qty, #inline-wizard-rate", function () {
						syncInlineFormData();
						refreshInlineComputedFields();
					})
					.on("change.newOppInlineWizard", "#inline-wizard-orc, #inline-wizard-commission-type", function () {
						syncInlineFormData();
						toggleInlineOrcFields();
					})
					.on("input.newOppInlineWizard", "#inline-wizard-rate-value, #inline-wizard-description", function () {
						syncInlineFormData();
					})
					.on("click.newOppInlineWizard", "#inline-wizard-cancel", function (e) {
						e.preventDefault();
						closeInlineWizard();
					})
					.on("click.newOppInlineWizard", "#inline-wizard-back", function (e) {
						e.preventDefault();
						syncInlineFormData();
						currentWizardStep = Math.max(1, currentWizardStep - 1);
						renderInlineWizard();
					})
					.on("click.newOppInlineWizard", "#inline-wizard-next", async function (e) {
						e.preventDefault();
						if (!isSessionActive()) return;
						syncInlineFormData();

						if (currentWizardStep === 1 && isRenewalLikeType()) {
							if (!itemData.item_code) {
								const loaded = await me.loadPresetForWizard(itemData.opportunity_type, itemData);
								if (!isSessionActive()) return;
								if (!loaded) {
									frappe.msgprint(__("Could not load " + itemData.opportunity_type + ". Please select an item or choose a different type."));
									return;
								}
								currentWizardStep = 2;
								renderInlineWizard();
								return;
							}
						}

						currentWizardStep = Math.min(3, currentWizardStep + 1);
						renderInlineWizard();
					})
					.on("click.newOppInlineWizard", "#inline-wizard-save", async function (e) {
						e.preventDefault();
						const submitPayload = getSubmitPayload();
						if (!String(submitPayload.item_code || "").trim()) {
							frappe.msgprint(__("Please select an Item Code before adding the item."));
							return;
						}

						if (isEditMode) {
							await me.updateItemFromWizard(submitPayload);
							frappe.show_alert({ message: __("Item updated successfully"), indicator: "green" });
						} else {
							await me.addItemFromWizard(submitPayload);
							frappe.show_alert({ message: __("Item added successfully"), indicator: "green" });
						}

						closeInlineWizard();
					});
			};

			const initialize = async () => {
				const presetType = String(presetOpportunityType || "").trim();
				if (!isEditMode && ["Renewal", "Additional"].includes(presetType)) {
					itemData.opportunity_type = presetType;
					const loaded = await me.loadPresetForWizard(presetType, itemData);
					if (!isSessionActive()) return;
					if (loaded) {
						currentWizardStep = 2;
					}
				}
				if (!isSessionActive()) return;
				updateItemCalculations();

				renderInlineWizard();
			};

			initialize();
		}

		openNewOppItemWizard(presetOpportunityType = null, editItemData = null) {
			return this.openNewOppItemWizardInline(presetOpportunityType, editItemData);

			const me = this;
			const $scope = $(this.page.wrapper);
			const hasVisibleWizard = $(".modal:visible, .frappe-dialog:visible").filter(function () {
				const text = $(this).text() || "";
				return text.includes("Add Item via Wizard") || text.includes("Edit Item via Wizard");
			}).length > 0;

			if (this._newOppItemWizardOpen && hasVisibleWizard) return;
			this._newOppItemWizardOpen = true;

			let currentWizardStep = editItemData ? 2 : 1;  // Skip type selection if editing
			const isEditMode = Boolean(editItemData);
			let itemData = {
				opportunity_type: presetOpportunityType || "New",
				item_code: "",
				item_name: "",
				qty: 1,
				rate: 0,
				amount: 0,
				brand: "",
				item_group: "",
				description: "",
				hsncode: "",
				uom: "",
				renewal_id: "",
				orc: 0,
				commission_type: "",
				rate_value: 0,
				// Edit mode: Store original row reference
				_editRowElement: editItemData?._rowElement,
			};

			// Pre-fill data if in edit mode
			if (editItemData) {
				Object.assign(itemData, editItemData);
				currentWizardStep = 2;
			}

			const updateItemCalculations = () => {
				const qty = Number(itemData.qty || 1);
				const rate = Number(itemData.rate || 0);
				itemData.amount = qty * rate;
			};

			const syncWizardFormData = ($dialog) => {
				if (!$dialog?.length) return;

				const qtyVal = Number($dialog.find("#wizard-qty").val());
				itemData.qty = Number.isFinite(qtyVal) && qtyVal > 0 ? qtyVal : 1;
				itemData.rate = Number($dialog.find("#wizard-rate").val()) || 0;
				itemData.orc = $dialog.find("#wizard-orc").is(":checked") ? 1 : 0;
				itemData.commission_type = String($dialog.find("#wizard-commission-type").val() || "").trim();
				itemData.rate_value = Number($dialog.find("#wizard-rate-value").val()) || 0;
				itemData.description = String($dialog.find("#wizard-description").val() || "").trim();
				itemData.renewal_id = String($dialog.find("#wizard-renewal-id-display").val() || itemData.renewal_id || "").trim();

				updateItemCalculations();
			};

			const getWizardSubmitPayload = ($dialog) => {
				syncWizardFormData($dialog);

				const itemCodeControl = $dialog.find("#wizard-item-code-control").data("control");
				const selectedItemCode = String(itemCodeControl?.get_value?.() || itemData.item_code || "").trim();
				if (selectedItemCode) {
					itemData.item_code = selectedItemCode;
				}

				const payload = {
					...itemData,
					item_code: String(itemData.item_code || "").trim(),
					item_name: String(itemData.item_name || "").trim(),
					qty: Number(itemData.qty || 1),
					rate: Number(itemData.rate || 0),
					renewal_id: String(itemData.renewal_id || "").trim(),
					description: String(itemData.description || "").trim(),
					commission_type: String(itemData.commission_type || "").trim(),
					rate_value: Number(itemData.rate_value || 0),
					orc: Number(itemData.orc || 0) ? 1 : 0,
				};

				payload.amount = Number(payload.qty * payload.rate);

				return payload;
			};

			const wizardToPlainText = (value) => {
				const html = value == null ? "" : String(value);
				if (!html) return "";

				const $root = $("<div>").html(html);
				$root.find("br").replaceWith("\n");
				$root.find("li").each(function () {
					const text = $(this).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
					$(this).replaceWith(text ? `\n• ${text}\n` : "");
				});
				$root.find("p, div").each(function () {
					const $el = $(this);
					if ($el.find("li").length) return;
					$el.append("\n");
				});

				return $root
					.text()
					.replace(/\u00a0/g, " ")
					.replace(/\n{3,}/g, "\n\n")
					.replace(/[ \t]+\n/g, "\n")
					.replace(/\n[ \t]+/g, "\n")
					.trim();
			};

			const wizardFormatCurrency = (value) => {
				const num = Number(value || 0);
				if (!Number.isFinite(num)) return "0.00";
				try {
					if (typeof format_currency === "function") {
						return format_currency(num);
					}
				} catch (e) {
					// Ignore and fall back to locale formatting.
				}
				return num.toLocaleString("en-IN", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});
			};

			const wizardParseNumber = (value) => {
				const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
				const num = Number(cleaned);
				return Number.isFinite(num) ? num : 0;
			};

			const setWizardCurrencyInputValue = ($input, value, format = true) => {
				if (!$input?.length) return;
				const numericValue = wizardParseNumber(value);
				$input.data("numericValue", numericValue);
				$input.val(format ? wizardFormatCurrency(numericValue) : String(numericValue || 0));
			};

			const getWizardCurrencyInputValue = ($input) => {
				if (!$input?.length) return 0;
				const currentValue = String($input.val() ?? "").trim();
				if (currentValue !== "") {
					const parsedCurrentValue = wizardParseNumber(currentValue);
					$input.data("numericValue", parsedCurrentValue);
					return parsedCurrentValue;
				}

				const storedValue = Number($input.data("numericValue"));
				if (Number.isFinite(storedValue)) {
					return storedValue;
				}

				const numericValue = wizardParseNumber($input.val());
				$input.data("numericValue", numericValue);
				return numericValue;
			};

			let wizardDialog = null;
			let wizardRenewalControl = null;

			const cleanupOrphanBackdrops = () => {
				const hasVisibleModal = $(".modal.show:visible, .frappe-dialog.modal.show:visible").length > 0;
				if (!hasVisibleModal) {
					$(".modal-backdrop").remove();
					$("body").removeClass("modal-open").css("padding-right", "");
				}
			};

			const moveFocusOutOfWizardDialog = (dialog) => {
				const wrapperEl = dialog?.$wrapper?.get?.(0);
				const activeEl = document.activeElement;
				if (wrapperEl && activeEl && wrapperEl.contains(activeEl) && typeof activeEl.blur === "function") {
					activeEl.blur();
				}

				const fallbackTarget =
					$scope.find("#new-opp-add-item:visible").get(0)
					|| $scope.find("#new-opp-add-item-renewal:visible").get(0)
					|| $scope.find("#new-opp-add-item-additional:visible").get(0)
					|| this.page?.wrapper
					|| document.body;

				if (fallbackTarget && typeof fallbackTarget.focus === "function") {
					try {
						fallbackTarget.focus({ preventScroll: true });
					} catch (e) {
						fallbackTarget.focus();
					}
				}
			};

			const isRenewalLikeType = () => ["Renewal", "Additional"].includes(String(itemData.opportunity_type || "").trim());

			const ensureWizardRenewalControl = ($dialog) => {
				if (!isRenewalLikeType()) {
					wizardRenewalControl = null;
					return;
				}

				const $renewalControl = $dialog.find("#wizard-renewal-id-control");
				if (!$renewalControl.length || !frappe?.ui?.form?.make_control) {
					wizardRenewalControl = null;
					return;
				}

				// Recreate the control if the container was rerendered or left empty.
				if (wizardRenewalControl && !$renewalControl.children().length) {
					wizardRenewalControl = null;
				}

				if (wizardRenewalControl) {
					wizardRenewalControl.set_value(itemData.renewal_id || "");
					$renewalControl.data('control', wizardRenewalControl);
					return;
				}

				$renewalControl.empty();

				wizardRenewalControl = frappe.ui.form.make_control({
					parent: $renewalControl,
					only_input: true,
					df: {
						fieldtype: "Link",
						fieldname: "wizard_renewal_id",
						options: me._newOppRenewalDoctype || "Renewal",
						label: "",
						placeholder: __("Select Renewal ID"),
						get_query: () => {
							const customerName = String(me.getNewOpportunityPartyName() || "").trim();
							const customerField = String(me._newOppRenewalCustomerFilterField || "").trim();
							if (!customerName || !customerField) return {};
							return {
								filters: {
									[customerField]: customerName,
								},
							};
						},
						onchange: async () => {
							itemData.renewal_id = String(wizardRenewalControl?.get_value?.() || "").trim();
							if (!itemData.renewal_id) return;

							try {
								const renewalDoctype = String(wizardRenewalControl?.df?.options || "Renewal").trim() || "Renewal";
								const renewalDoc = await frappe.db.get_doc(renewalDoctype, itemData.renewal_id);
								const preset = await me.extractRenewalItemPreset(
									renewalDoc,
									itemData.renewal_id,
									String(itemData.opportunity_type || "Renewal").trim() || "Renewal"
								);
								if (!preset?.item_code) {
									frappe.msgprint(__("No valid item found in selected renewal."));
									return;
								}

								Object.assign(itemData, {
									...preset,
									opportunity_type: String(itemData.opportunity_type || preset.opportunity_type || "Renewal").trim(),
								});
								updateItemCalculations();
								updateWizardStepUI(wizardDialog);
							} catch (e) {
								frappe.msgprint(__("Unable to fetch selected renewal."));
							}
						},
					},
					render_input: true,
				});
				wizardRenewalControl.set_value(itemData.renewal_id || "");
				$renewalControl.data('control', wizardRenewalControl);
				me.attachInlineLinkPortal(wizardRenewalControl);
			};

			const updateWizardStepUI = (dialog) => {
				const $dialog = $(dialog.$wrapper);
				$dialog.find(".wizard-step").each(function () {
					const step = Number($(this).data("step") || 0);
					$(this)
						.toggleClass("active", step === currentWizardStep)
						.toggleClass("completed", step < currentWizardStep);
				});

				$dialog.find(".wizard-connector").each(function (idx) {
					$(this).toggleClass("completed", idx + 1 < currentWizardStep);
				});

				$dialog.find(".wizard-panel").each(function () {
					const panel = Number($(this).data("panel") || 0);
					$(this).toggleClass("d-none", panel !== currentWizardStep);
				});

				$dialog
					.find("#wizard-renewal-section-step2")
					.toggle(isRenewalLikeType());

				$dialog
					.find("#wizard-change-renewal-section")
					.toggle(isRenewalLikeType());

				$dialog
					.find(".orc-dependent")
					.toggle(Boolean(itemData.orc));

				$dialog.find("#wizard-item-name-label").text(itemData.item_name || "—");
				$dialog.find("#wizard-item-name-label").attr("title", itemData.item_name || "");
				$dialog.find("#wizard-qty").val(itemData.qty ?? 1);
				$dialog.find("#wizard-rate").val(itemData.rate ?? 0);
				$dialog.find("#wizard-amount").val(wizardFormatCurrency(itemData.amount));
				$dialog.find("#wizard-renewal-id-display").val(itemData.renewal_id || "");
				$dialog.find("#wizard-orc").prop("checked", Boolean(itemData.orc));
				$dialog.find("#wizard-commission-type").val(itemData.commission_type || "");
				$dialog.find("#wizard-rate-value").val(itemData.rate_value ?? 0);
				$dialog.find("#wizard-description").val(String(itemData.description || "").trim());

				// Sync Link control values
				setTimeout(() => {
					const itemCodeControl = $dialog.find('#wizard-item-code-control').data('control');
					if (itemCodeControl?.set_value && itemData.item_code) {
						itemCodeControl.set_value(itemData.item_code);
					}
					if (wizardRenewalControl?.set_value) {
						wizardRenewalControl.set_value(itemData.renewal_id || "");
					}
				}, 100);

				dialog.set_primary_action(
					currentWizardStep === 3 ? __(isEditMode ? "Update Item" : "Add Item") : __("Next"),
					dialog._wizardPrimaryAction
				);

				const secondaryLabel = (isEditMode || currentWizardStep === 1) ? __("Cancel") : __("Back");
				const $secondaryBtn = typeof dialog.get_secondary_btn === "function"
					? dialog.get_secondary_btn()
					: $dialog.find(".modal-footer .btn-modal-secondary, .modal-footer .btn-secondary").first();

				if ($secondaryBtn?.length) {
					$secondaryBtn.text(secondaryLabel);
				}

				ensureWizardRenewalControl($dialog);
			};

			const renderWizardStep = () => {
				if (wizardDialog?.$wrapper?.length) {
					updateWizardStepUI(wizardDialog);
					return;
				}

				const dialog = new frappe.ui.Dialog({
					title: __(isEditMode ? "Edit Item via Wizard" : "Add Item via Wizard"),
					size: "large",
					fields: [
						{
							fieldtype: "HTML",
							fieldname: "wizard_content",
							options: `
							<style>
								#wizard-item-code-control { width: 100% !important; }
								#wizard-item-code-control .frappe-control { width: 100% !important; }
								#wizard-item-code-control .form-group { margin-bottom: 0 !important; }
								#wizard-item-code-control .control-input-wrapper { margin: 0 !important; }
								#wizard-item-code-control .form-control { width: 100% !important; }
								#wizard-item-code-control input.input-with-feedback { width: 100% !important; }
								#wizard-item-code-control input.input-with-feedback { min-height: 38px !important; }
								#wizard-item-code-control .awesomplete { width: 100% !important; }
							</style>
							<div class="new-item-wizard">
								<div class="wizard-steps mb-4" style="${isEditMode ? 'display:none;' : ''}">
									<div class="d-flex justify-content-center">
										<div class="wizard-step ${currentWizardStep >= 1 ? 'active' : ''} ${currentWizardStep > 1 ? 'completed' : ''}" data-step="1">
											<span class="step-number">1</span>
											<span class="step-label">Type</span>
										</div>
										<div class="wizard-connector ${currentWizardStep > 1 ? 'completed' : ''}"></div>
										<div class="wizard-step ${currentWizardStep >= 2 ? 'active' : ''} ${currentWizardStep > 2 ? 'completed' : ''}" data-step="2">
											<span class="step-number">2</span>
											<span class="step-label">Basic Info</span>
										</div>
										<div class="wizard-connector ${currentWizardStep > 2 ? 'completed' : ''}"></div>
										<div class="wizard-step ${currentWizardStep >= 3 ? 'active' : ''} ${currentWizardStep > 3 ? 'completed' : ''}" data-step="3">
											<span class="step-number">3</span>
											<span class="step-label">Details</span>
										</div>
									</div>
								</div>
								<div class="wizard-panels">
									<div class="wizard-panel ${(currentWizardStep === 1 && !isEditMode) ? '' : 'd-none'}" data-panel="1">
										<div class="text-center mb-4">
											<h5>Select Item Type</h5>
											<p class="text-muted">Choose the type of item you want to add</p>
										</div>
										<div class="row justify-content-center">
											<div class="col-md-4 mb-3">
												<div class="item-type-card ${itemData.opportunity_type === 'New' ? 'selected' : ''}" data-type="New">
													<div class="card h-100">
														<div class="card-body text-center">
															<i class="fa fa-plus-circle fa-3x text-primary mb-3"></i>
															<h6>Add New Item</h6>
															<p class="text-muted small">Add a new product or service</p>
														</div>
													</div>
												</div>
											</div>
											<div class="col-md-4 mb-3">
												<div class="item-type-card ${itemData.opportunity_type === 'Renewal' ? 'selected' : ''}" data-type="Renewal">
													<div class="card h-100">
														<div class="card-body text-center">
															<i class="fa fa-refresh fa-3x text-success mb-3"></i>
															<h6>Renewal Item</h6>
															<p class="text-muted small">Renew existing subscription/service</p>
														</div>
													</div>
												</div>
											</div>
											<div class="col-md-4 mb-3">
												<div class="item-type-card ${itemData.opportunity_type === 'Additional' ? 'selected' : ''}" data-type="Additional">
													<div class="card h-100">
														<div class="card-body text-center">
															<i class="fa fa-plus fa-3x text-info mb-3"></i>
															<h6>Additional Item</h6>
															<p class="text-muted small">Add-on to existing service</p>
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>
									<div class="wizard-panel ${currentWizardStep === 2 ? '' : 'd-none'}" data-panel="2">
										<div class="text-center mb-4">
											<h5>Basic Information</h5>
											<p class="text-muted">Enter the basic details for the item</p>
										</div>
										<div class="row">
											<div class="col-md-6 mb-3">
												<label class="form-label">Item Code <span class="text-danger">*</span></label>
												<div id="wizard-item-code-control" style="width:100%;"></div>
											</div>
											<div class="col-md-6 mb-3">
												<label class="form-label">Item Name</label>
												<div class="form-control" style="background-color:#f8f9fa; color:#555; font-weight:500; border:1px solid #dee2e6; cursor:default; display:flex; align-items:center; min-height:38px; padding:0.375rem 0.75rem; overflow:hidden;">
													<span id="wizard-item-name-label" title="${frappe.utils.escape_html(itemData.item_name || '')}" style="display:block; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${frappe.utils.escape_html(itemData.item_name) || '—'}</span>
												</div>
											</div>
										</div>
										<div class="row">
											<div class="col-md-3 mb-3">
												<label class="form-label">Quantity <span class="text-danger">*</span></label>
												<input type="number" class="form-control" id="wizard-qty" value="${itemData.qty}" min="1" step="any">
											</div>
											<div class="col-md-3 mb-3">
												<label class="form-label">Rate <span class="text-danger">*</span></label>
												<div class="input-group">
													<div class="input-group-prepend">
														<span class="input-group-text">₹</span>
													</div>
													<input type="number" class="form-control" id="wizard-rate" value="${itemData.rate}" min="0" step="0.01">
												</div>
											</div>
											<div class="col-md-6 mb-3">
												<label class="form-label">Amount</label>
												<input type="text" class="form-control" id="wizard-amount" value="${wizardFormatCurrency(itemData.amount)}" readonly>
											</div>
											<div class="col-md-6 mb-3">
											<div class="col-md-6 mb-3" id="wizard-renewal-section-step2" style="${itemData.opportunity_type === 'Renewal' || itemData.opportunity_type === 'Additional' ? '' : 'display:none;'}">
												<label class="form-label">Renewal ID <span class="text-danger">*</span></label>
												<input type="text" class="form-control mb-2" id="wizard-renewal-id-display" value="${frappe.utils.escape_html(itemData.renewal_id || '')}" readonly>
											</div>
											<div class="col-md-6 mb-3" id="wizard-change-renewal-section" style="${itemData.opportunity_type === 'Renewal' || itemData.opportunity_type === 'Additional' ? '' : 'display:none;'}">
												<label class="form-label">&nbsp;</label>
												<button type="button" class="btn btn-sm btn-outline-secondary w-100" id="wizard-change-renewal">
													<i class="fa fa-pencil"></i> Change Renewal
												</button>
											</div>
										</div>
									</div>
									<div class="wizard-panel ${currentWizardStep === 3 ? '' : 'd-none'}" data-panel="3">
										<div class="text-center mb-4">
											<h5>Additional Details</h5>
											<p class="text-muted">Configure additional item settings</p>
										</div>
										<div class="row">
											<div class="col-md-6 mb-3">
												<label class="form-label">ORC</label>
												<div class="form-check">
													<input type="checkbox" class="form-check-input" id="wizard-orc" ${itemData.orc ? 'checked' : ''}>
													<label class="form-check-label" for="wizard-orc">Enable ORC</label>
												</div>
											</div>
											<div class="col-md-6 mb-3 orc-dependent" style="${itemData.orc ? '' : 'display:none;'}">
												<label class="form-label">Commission Type</label>
												<select class="form-control" id="wizard-commission-type">
													<option value="" ${itemData.commission_type === '' ? 'selected' : ''}>Select</option>
													<option value="Unit Rate" ${itemData.commission_type === 'Unit Rate' ? 'selected' : ''}>Unit Rate</option>
													<option value="Value" ${itemData.commission_type === 'Value' ? 'selected' : ''}>Value</option>
												</select>
											</div>
											<div class="col-md-6 mb-3 orc-dependent" style="${itemData.orc ? '' : 'display:none;'}">
												<label class="form-label">Rate Value</label>
												<input type="number" class="form-control" id="wizard-rate-value" value="${itemData.rate_value}" min="0" step="0.01">
											</div>
											<div class="col-md-12 mb-3">
												<label class="form-label">Description</label>
												<textarea class="form-control" id="wizard-description" rows="3">${frappe.utils.escape_html(itemData.description)}</textarea>
											</div>
										</div>
									</div>
								</div>
							</div>
						`
						}
					],
					primary_action_label: currentWizardStep === 3 ? __(isEditMode ? "Update Item" : "Add Item") : __("Next"),
					primary_action: async () => {
						const $dialog = $(dialog.$wrapper);
						const activeElement = document.activeElement;
						if (activeElement && $dialog.get(0)?.contains(activeElement) && typeof activeElement.blur === "function") {
							activeElement.blur();
						}
						syncWizardFormData($dialog);

						if (currentWizardStep < 3) {
							currentWizardStep++;
							updateWizardStepUI(dialog);
						} else {
							const submitPayload = getWizardSubmitPayload($dialog);
							if (!String(submitPayload.item_code || "").trim()) {
								frappe.msgprint(__("Please select an Item Code before adding the item."));
								return;
							}

							if (isEditMode) {
								await me.updateItemFromWizard(submitPayload);
								frappe.show_alert({ message: __("Item updated successfully"), indicator: "green" });
							} else {
								await me.addItemFromWizard(submitPayload);
								frappe.show_alert({ message: __("Item added successfully"), indicator: "green" });
							}
							dialog.hide();
						}
					},
					secondary_action_label: (isEditMode || currentWizardStep === 1) ? __("Cancel") : __("Back"),
					secondary_action: () => {
						if (isEditMode || currentWizardStep === 1) {
							me._newOppItemWizardOpen = false;
							dialog.hide();
						} else {
							syncWizardFormData($(dialog.$wrapper));
							currentWizardStep--;
							updateWizardStepUI(dialog);
						}
					}
				});
				dialog._wizardPrimaryAction = dialog.primary_action;
				dialog._wizardSecondaryAction = dialog.secondary_action;

				const originalHide = dialog.hide.bind(dialog);
				dialog.hide = function () {
					me._newOppItemWizardOpen = false;
					moveFocusOutOfWizardDialog(dialog);
					const result = originalHide();
					setTimeout(() => cleanupOrphanBackdrops(), 0);
					return result;
				};
				wizardDialog = dialog;
				$(dialog.$wrapper).addClass("new-item-wizard-dialog");

				// Add wizard styles
				const style = document.createElement('style');
				style.textContent = `
				.new-item-wizard-dialog .modal-header .btn-modal-close,
				.new-item-wizard-dialog .modal-header .close {
					color: #1d4ed8;
					opacity: 1;
				}
				.new-item-wizard-dialog .modal-header .btn-modal-close:hover,
				.new-item-wizard-dialog .modal-header .close:hover {
					color: #1e40af;
				}
				.new-item-wizard .wizard-steps { margin-bottom: 2rem; }
				.new-item-wizard .wizard-step {
					display: flex;
					flex-direction: column;
					align-items: center;
					padding: 1rem;
					border-radius: 50%;
					background: #f8f9fa;
					border: 2px solid #dee2e6;
					width: 80px;
					height: 80px;
					justify-content: center;
					transition: all 0.3s ease;
				}
				.new-item-wizard .wizard-step.active {
					background: #007bff;
					border-color: #007bff;
					color: white;
				}
				.new-item-wizard .wizard-step.completed {
					background: #28a745;
					border-color: #28a745;
					color: white;
				}
				.new-item-wizard .wizard-connector {
					width: 60px;
					height: 2px;
					background: #dee2e6;
					margin: 40px 10px 0;
					transition: background 0.3s ease;
				}
				.new-item-wizard .wizard-connector.completed {
					background: #28a745;
				}
				.new-item-wizard .step-number {
					font-size: 1.2rem;
					font-weight: bold;
					margin-bottom: 0.25rem;
				}
				.new-item-wizard .step-label {
					font-size: 0.8rem;
					text-align: center;
				}
				.new-item-wizard .item-type-card {
					cursor: pointer;
					transition: all 0.3s ease;
				}
				.new-item-wizard .item-type-card:hover {
					transform: translateY(-5px);
					box-shadow: 0 4px 8px rgba(0,0,0,0.1);
				}
				.new-item-wizard .item-type-card.selected .card {
					border-color: #007bff;
					box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
				}
				.new-item-wizard .wizard-panel {
					min-height: 300px;
				}
			`;
				document.head.appendChild(style);

				// Setup event handlers
				setTimeout(async () => {
					const $dialog = $(dialog.$wrapper);

					$dialog
						.off('click.wizardClose', '.btn-modal-close, .close')
						.on('click.wizardClose', '.btn-modal-close, .close', function (e) {
							e.preventDefault();
							e.stopImmediatePropagation();
							dialog.hide();
						});

					// Step 1: Item type selection
					$dialog.off('click.wizard', '.item-type-card').on('click.wizard', '.item-type-card', async function () {
						const type = $(this).data('type');
						const previousData = { ...itemData };
						itemData.opportunity_type = type;
						$dialog.find('.item-type-card').removeClass('selected');
						$(this).addClass('selected');

						// Auto-load renewal/additional presets if applicable
						let shouldAdvanceToStep2 = false;
						if (type === 'Renewal' || type === 'Additional') {
							const loaded = await me.loadPresetForWizard(type, itemData);
							if (!loaded) {
								itemData = { ...previousData };
								$dialog.find('.item-type-card').removeClass('selected');
								$dialog.find(`.item-type-card[data-type="${frappe.utils.escape_html(String(previousData.opportunity_type || 'New'))}"]`).addClass('selected');
							} else {
								shouldAdvanceToStep2 = true;
							}
						} else {
							itemData.renewal_id = "";
							shouldAdvanceToStep2 = true;
						}

						if (!isEditMode && shouldAdvanceToStep2) {
							currentWizardStep = 2;
						}

						updateWizardStepUI(dialog);

						if (!isEditMode && shouldAdvanceToStep2 && type === 'New') {
							setTimeout(() => {
								const control = $dialog.find('#wizard-item-code-control').data('control');
								if (control?.open_advanced_search) {
									control.open_advanced_search();
								}
							}, 120);
						}
					});

					// Step 2: Basic info
					const $itemCodeControl = $dialog.find('#wizard-item-code-control');
					if ($itemCodeControl.length && frappe?.ui?.form?.make_control) {
						const itemCodeControl = frappe.ui.form.make_control({
							parent: $itemCodeControl,
							only_input: true,
							df: {
								fieldtype: "Link",
								fieldname: "wizard_item_code",
								options: "Item",
								label: "",
								placeholder: __("Select Item"),
								get_query: () => ({ filters: { disabled: 0 } }),
								onchange: async () => {
									const code = itemCodeControl.get_value();
									if (code) {
										const meta = await me.getItemAutofill(code);
										if (meta) {
											// Only auto-fill rate when the item code actually changes.
											// If the same code is set programmatically (e.g. by updateWizardStepUI),
											// skip rate so manually entered values are preserved.
											const isNewItem = code !== itemData.item_code;
											itemData.item_code = code;
											itemData.item_name = meta.item_name || code;
											itemData.brand = meta.brand || "";
											itemData.item_group = meta.item_group || "";
											itemData.description_html = String(meta.description_html || meta.description || "");
											itemData.description = String(wizardToPlainText(itemData.description_html) || "").trim();
											itemData.uom = meta.uom || "";
											itemData.hsncode = meta.hsncode || "";
											if (isNewItem) {
												itemData.rate = Number(meta.rate || 0);
											}
											updateItemCalculations();

											$dialog.find('#wizard-item-name-label').text(itemData.item_name);
											$dialog.find('#wizard-item-name-label').attr('title', itemData.item_name || '');
											if (isNewItem) {
												$dialog.find('#wizard-rate').val(itemData.rate);
											}
											$dialog.find('#wizard-amount').val(wizardFormatCurrency(itemData.amount));
											$dialog.find('#wizard-description').val(String(wizardToPlainText(itemData.description_html || itemData.description || "") || "").trim());
										}
									}
								},
							},
							render_input: true,
						});
						$itemCodeControl.data('control', itemCodeControl);
						me.configureItemAdvancedSearch(itemCodeControl);
						me.attachInlineLinkPortal(itemCodeControl);

						const applyItemAutofillFromControl = async () => {
							const selectedCode = String(itemCodeControl.get_value?.() || itemCodeControl.$input?.val?.() || "").trim();
							if (!selectedCode || selectedCode === itemData.item_code) return;

							const meta = await me.getItemAutofill(selectedCode);
							if (!meta) return;

							itemData.item_code = selectedCode;
							itemData.item_name = meta.item_name || selectedCode;
							itemData.brand = meta.brand || "";
							itemData.item_group = meta.item_group || "";
							itemData.description_html = String(meta.description_html || meta.description || "");
							itemData.description = String(wizardToPlainText(itemData.description_html) || "").trim();
							itemData.uom = meta.uom || "";
							itemData.hsncode = meta.hsncode || "";
							itemData.rate = Number(meta.rate || 0);
							updateItemCalculations();

							$dialog.find('#wizard-item-name-label').text(itemData.item_name);
							$dialog.find('#wizard-item-name-label').attr('title', itemData.item_name || '');
							$dialog.find('#wizard-rate').val(itemData.rate);
							$dialog.find('#wizard-amount').val(wizardFormatCurrency(itemData.amount));
							$dialog.find('#wizard-description').val(String(wizardToPlainText(itemData.description_html || itemData.description || "") || "").trim());
						};

						itemCodeControl.$input
							?.off("awesomplete-selectcomplete.wizardAutoFill change.wizardAutoFill blur.wizardAutoFill")
							?.on("awesomplete-selectcomplete.wizardAutoFill change.wizardAutoFill blur.wizardAutoFill", () => {
								setTimeout(() => {
									applyItemAutofillFromControl();
								}, 60);
							});
					}

					// Quantity and rate change handlers
					$dialog.find('#wizard-qty, #wizard-rate').on('input change', function () {
						itemData.qty = Number($dialog.find('#wizard-qty').val()) || 1;
						itemData.rate = Number($dialog.find('#wizard-rate').val()) || 0;
						updateItemCalculations();
						$dialog.find('#wizard-amount').val(wizardFormatCurrency(itemData.amount));
					});

					$dialog.find('#wizard-orc').on('change', function () {
						itemData.orc = $(this).is(':checked') ? 1 : 0;
						$dialog.find('.orc-dependent').toggle(itemData.orc);
					});

					$dialog.find('#wizard-commission-type').on('change', function () {
						itemData.commission_type = $(this).val();
					});

					$dialog.find('#wizard-rate-value').on('input', function () {
						itemData.rate_value = Number($(this).val()) || 0;
					});

					$dialog.find('#wizard-description').on('input', function () {
						itemData.description = $(this).val();
					});

					// Setup Change Renewal button
					$dialog.off('click', '#wizard-change-renewal').on('click', '#wizard-change-renewal', async function (e) {
						e.preventDefault();
						const preset = await me.pickRenewalPresetItem(String(itemData.opportunity_type || "Renewal").trim(), me.getNewOpportunityPartyName());
						if (preset?.item_code) {
							Object.assign(itemData, {
								...preset,
								opportunity_type: String(itemData.opportunity_type || preset.opportunity_type || "Renewal").trim(),
							});
							updateItemCalculations();

							// Sync item code to control
							const itemCodeControl = $dialog.find('#wizard-item-code-control').data('control');
							if (itemCodeControl?.set_value && itemData.item_code) {
								itemCodeControl.set_value(itemData.item_code);
							}

							ensureWizardRenewalControl($dialog);
							updateWizardStepUI(dialog);
						}
					});

					const shouldAutoPickRenewal = !isEditMode && ["Renewal", "Additional"].includes(String(presetOpportunityType || "").trim());
					if (shouldAutoPickRenewal) {
						const loaded = await me.loadPresetForWizard(String(presetOpportunityType || "").trim(), itemData);
						if (!loaded) {
							itemData.opportunity_type = "New";
							itemData.renewal_id = "";
							$dialog.find('.item-type-card').removeClass('selected');
							$dialog.find('.item-type-card[data-type="New"]').addClass('selected');
						}
					}

					ensureWizardRenewalControl($dialog);
					updateWizardStepUI(dialog);
				}, 100);

				dialog.show();
			};

			renderWizardStep();
		}

		async addItemFromWizard(itemData) {
			const addItemRow = this._addNewOppItemRow;
			if (typeof addItemRow !== "function") {
				throw new Error("New opportunity item row helper is not available.");
			}

			const normalizedItem = {
				...itemData,
				item_code: String(itemData?.item_code || "").trim(),
				item_name: String(itemData?.item_name || "").trim(),
				qty: Number(itemData?.qty || 1),
				rate: Number(itemData?.rate || 0),
				opportunity_type: String(itemData?.opportunity_type || "New").trim() || "New",
				description: String(itemData?.description || "").trim(),
				renewal_id: String(itemData?.renewal_id || "").trim(),
				commission_type: String(itemData?.commission_type || "").trim(),
				rate_value: Number(itemData?.rate_value || 0),
				orc: Number(itemData?.orc || 0) ? 1 : 0,
			};

			normalizedItem.amount = Number(normalizedItem.qty * normalizedItem.rate);

			await addItemRow(normalizedItem);
			$(this.page.wrapper).trigger("new-opp-items-visibility-refresh");
		}

		async updateItemFromWizard(itemData) {
			const isDetailEdit = String(itemData?._editContext || "").trim() === "detail";
			if (isDetailEdit) {
				const docname = String(this._currentOpportunityName || "").trim();
				if (!docname) {
					throw new Error("Opportunity is not loaded for detail edit.");
				}

				const normalizedItem = {
					...itemData,
					item_code: String(itemData?.item_code || "").trim(),
					item_name: String(itemData?.item_name || "").trim(),
					qty: Number(itemData?.qty || 1),
					rate: Number(itemData?.rate || 0),
					opportunity_type: String(itemData?.opportunity_type || "New").trim() || "New",
					description: String(itemData?.description || "").trim(),
					renewal_id: String(itemData?.renewal_id || "").trim(),
					commission_type: String(itemData?.commission_type || "").trim(),
					rate_value: Number(itemData?.rate_value || 0),
					orc: Number(itemData?.orc || 0) ? 1 : 0,
				};

				normalizedItem.amount = Number(normalizedItem.qty * normalizedItem.rate);

				const latestDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, docname);
				const rows = Array.isArray(latestDoc.items) ? latestDoc.items : [];
				const editRowName = String(itemData?._editRowName || "").trim();
				const editRowIdx = Number(itemData?._editRowIdx);

				const targetRow = (editRowName ? rows.find((row) => String(row?.name || "").trim() === editRowName) : null)
					|| (Number.isFinite(editRowIdx) && editRowIdx >= 0 ? rows[editRowIdx] : null);
				if (!targetRow) {
					throw new Error("Unable to locate the item row for detail edit.");
				}

				Object.assign(targetRow, {
					item_code: normalizedItem.item_code,
					item_name: normalizedItem.item_name,
					qty: normalizedItem.qty,
					rate: normalizedItem.rate,
					amount: normalizedItem.amount,
					opportunity_type: normalizedItem.opportunity_type,
					custom_opportunity_type: normalizedItem.opportunity_type,
					renewal_id: normalizedItem.renewal_id,
					description: normalizedItem.description,
					brand: String(itemData?.brand || targetRow.brand || "").trim(),
					item_group: String(itemData?.item_group || targetRow.item_group || "").trim(),
					uom: String(itemData?.uom || targetRow.uom || targetRow.stock_uom || "").trim(),
					hsncode: String(itemData?.hsncode || targetRow.hsncode || targetRow.hsn_code || targetRow.gst_hsn_code || "").trim(),
					orc: normalizedItem.orc,
					commission_type: normalizedItem.commission_type,
					rate_value: normalizedItem.rate_value,
				});

				const saveRes = await frappe.call({
					method: "frappe.client.save",
					args: { doc: this.prepareDocForSave(latestDoc) },
					freeze: true,
					freeze_message: __("Updating item..."),
				});

				if (saveRes?.message) {
					this._currentOpportunityDoc = saveRes.message;
				}

				await this.load_doc_details(docname);
				frappe.show_alert({ message: __("Item updated successfully"), indicator: "green" });
				return;
			}

			const $scope = $(this.page.wrapper);
			const $rowElement = itemData._editRowElement;
			if (!$rowElement || !$rowElement.length) {
				throw new Error("Row element not found for update.");
			}

			const normalizedItem = {
				...itemData,
				item_code: String(itemData?.item_code || "").trim(),
				item_name: String(itemData?.item_name || "").trim(),
				qty: Number(itemData?.qty || 1),
				rate: Number(itemData?.rate || 0),
				opportunity_type: String(itemData?.opportunity_type || "New").trim() || "New",
				description: String(itemData?.description || "").trim(),
				renewal_id: String(itemData?.renewal_id || "").trim(),
				commission_type: String(itemData?.commission_type || "").trim(),
				rate_value: Number(itemData?.rate_value || 0),
				orc: Number(itemData?.orc || 0) ? 1 : 0,
			};

			normalizedItem.amount = Number(normalizedItem.qty * normalizedItem.rate);

			// Update the row display
			$rowElement.find(".new-opp-display-item-name").text(normalizedItem.item_name || "-").attr("title", normalizedItem.item_name || "-");
			$rowElement.find(".new-opp-display-item-code-sub").text(normalizedItem.item_code).attr("title", normalizedItem.item_code);
			$rowElement.find(".new-opp-display-qty").text(fmtInt(normalizedItem.qty));
			$rowElement.find(".new-opp-display-rate").text(fmtCurrency(normalizedItem.rate));
			$rowElement.find(".new-opp-display-amount").text(fmtCurrency(normalizedItem.amount));
			$rowElement.find(".new-opp-display-renewal-id").text(normalizedItem.renewal_id || "-").attr("title", normalizedItem.renewal_id || "-");

			// Update hidden fields
			$rowElement.find(".new-opp-item-code").val(normalizedItem.item_code);
			$rowElement.find(".new-opp-item-name").val(normalizedItem.item_name);
			$rowElement.find(".new-opp-item-qty").val(normalizedItem.qty);
			$rowElement.find(".new-opp-item-rate").val(normalizedItem.rate);
			$rowElement.find(".new-opp-item-amount").val(normalizedItem.amount);
			$rowElement.find(".new-opp-item-opportunity-type").val(normalizedItem.opportunity_type);
			$rowElement.find(".new-opp-item-renewal-id").val(normalizedItem.renewal_id);
			$rowElement.find(".new-opp-item-orc").prop("checked", normalizedItem.orc ? true : false);
			$rowElement.find(".new-opp-item-commission-type").val(normalizedItem.commission_type);
			$rowElement.find(".new-opp-item-rate-value").val(normalizedItem.rate_value);
			$rowElement.find(".new-opp-item-description").val(normalizedItem.description);

			// Update internal data
			$rowElement.data("currentItemValues", { ...normalizedItem });
			$rowElement.data("manualItemValues", { ...normalizedItem });

			$(this.page.wrapper).trigger("new-opp-items-visibility-refresh");
		}

		async loadPresetForWizard(type, itemData) {
			const opportunityType = String(type || "").trim() || "Renewal";
			itemData.opportunity_type = opportunityType;

			if (!["Renewal", "Additional"].includes(opportunityType)) {
				return true;
			}

			const customerName = String(
				this.getNewOpportunityPartyName?.()
				|| this.getCurrentOpportunityCustomerName?.()
				|| ""
			).trim();
			if (!customerName) {
				frappe.msgprint(__("Please select a Customer first."));
				return false;
			}

			const preset = await this.pickRenewalPresetItem(opportunityType, customerName);
			if (!preset?.item_code) {
				return false;
			}

			Object.assign(itemData, {
				...preset,
				opportunity_type: opportunityType,
			});

			itemData.amount = Number(itemData.qty || 0) * Number(itemData.rate || 0);

			return true;
		}

		ensureNewOpportunityControls() {
			const $scope = $(this.page.wrapper);

			const ensureLinkControl = (hostSelector, stateKey, options) => {
				const $host = $scope.find(hostSelector);
				if (!$host.length || !frappe?.ui?.form?.make_control) return;
				const isObjectOptions = options && typeof options === "object";
				const doctypeOptions = isObjectOptions ? options.options : options;
				const getQueryFn = isObjectOptions ? options.get_query : null;

				const existingControl = this[stateKey];
				if (existingControl) {
					if (getQueryFn) {
						existingControl.df.get_query = getQueryFn;
					}
					const wrapperEl = existingControl.$wrapper?.get?.(0);
					const hostEl = $host.get(0);

					if (wrapperEl && hostEl && !hostEl.contains(wrapperEl)) {
						$host.empty().append(existingControl.$wrapper);
					}

					if (typeof existingControl.refresh === "function") {
						existingControl.refresh();
					}

					this.attachInlineLinkPortal(existingControl);
					return;
				}

				$host.empty();
				this[stateKey] = frappe.ui.form.make_control({
					parent: $host,
					df: {
						fieldtype: "Link",
						fieldname: stateKey,
						label: "",
						options: doctypeOptions,
						get_query: getQueryFn,
					},
					render_input: true,
				});
				this.attachInlineLinkPortal(this[stateKey]);
			};

			ensureLinkControl("#new-opp-party-name-control", "_newOppPartyControl", "Customer");
			ensureLinkControl("#new-opp-company-control", "_newOppCompanyControl", "Company");
			ensureLinkControl("#new-opp-sales-person-control", "_newOppSalesPersonControl", "Sales Person");
			ensureLinkControl("#new-opp-customer-address-control", "_newOppCustomerAddressControl", {
				options: "Address",
				get_query: () => {
					const customerName = String(this.getNewOpportunityPartyName() || "").trim();
					if (!customerName) return {};
					return {
						query: "frappe.contacts.doctype.address.address.address_query",
						filters: {
							link_doctype: "Customer",
							link_name: customerName,
						},
					};
				},
			});
			ensureLinkControl("#new-opp-shipping-address-control", "_newOppShippingAddressControl", {
				options: "Address",
				get_query: () => {
					const customerName = String(this.getNewOpportunityPartyName() || "").trim();
					if (!customerName) return {};
					return {
						query: "frappe.contacts.doctype.address.address.address_query",
						filters: {
							link_doctype: "Customer",
							link_name: customerName,
						},
					};
				},
			});
			ensureLinkControl("#new-opp-company-address-control", "_newOppCompanyAddressControl", {
				options: "Address",
				get_query: () => {
					const companyName = String(this.getNewOpportunityCompany() || "").trim();
					if (!companyName) return {};
					return {
						query: "frappe.contacts.doctype.address.address.address_query",
						filters: {
							link_doctype: "Company",
							link_name: companyName,
						},
					};
				},
			});
			ensureLinkControl("#new-opp-tax-category-control", "_newOppTaxCategoryControl", "Tax Category");
			ensureLinkControl("#new-opp-tax-template-control", "_newOppTaxTemplateControl", {
				options: "Sales Taxes and Charges Template",
				get_query: () => {
					const companyName = String(this.getNewOpportunityCompany() || "").trim();
					const taxCategory = String(this.getNewOpportunityTaxCategory() || "").trim();
					const filters = {};
					if (companyName) filters.company = companyName;
					if (taxCategory) filters.tax_category = taxCategory;
					return Object.keys(filters).length ? { filters } : {};
				},
			});
			ensureLinkControl("#new-opp-payment-terms-control", "_newOppPaymentTermsControl", "Payment Terms Template");
			ensureLinkControl("#new-opp-terms-template-control", "_newOppTermsTemplateControl", "Terms and Conditions");

			const $poAttachmentHost = $scope.find("#new-opp-po-attachment-control");
			if ($poAttachmentHost.length) {
				const me = this;
				const existingControl = this._newOppPoAttachmentControl;
				if (existingControl) {
					const wrapperEl = existingControl.$wrapper?.get?.(0);
					const hostEl = $poAttachmentHost.get(0);

					if (wrapperEl && hostEl && !hostEl.contains(wrapperEl)) {
						$poAttachmentHost.empty().append(existingControl.$wrapper);
					}

					if (typeof existingControl.refresh === "function") {
						existingControl.refresh();
					}
					return;
				}

				if (frappe?.ui?.form?.make_control) {
					$poAttachmentHost.empty();
					const poAttachmentControl = frappe.ui.form.make_control({
						parent: $poAttachmentHost,
						df: {
							fieldtype: "Attach",
							fieldname: "custom_po_attachment",
							label: "",
							options: "",
							placeholder: __("Attach file"),
							allow_multiple: 0,
						},
						render_input: true,
					});

					const currentValue = me.getNewOpportunityPoAttachment();
					if (currentValue) {
						poAttachmentControl.set_value(currentValue);
					}

					const originalSetValue = poAttachmentControl.set_value.bind(poAttachmentControl);
					poAttachmentControl.set_value = (value) => {
						me.setNewOpportunityPoAttachment(value || "");
						originalSetValue(value);
					};

					this._newOppPoAttachmentControl = poAttachmentControl;
				} else {
					// Fallback to a simple attach-style button when make_control is unavailable
					$poAttachmentHost.empty();
					const attachmentHtml = `
					<div class="frappe-control" data-fieldname="custom_po_attachment" data-fieldtype="Attach">
						<div class="control-value">
							<div class="attach-input-wrapper" style="display: flex; gap: 4px; align-items: center;">
								<input type="text" class="input-with-feedback form-control attach-display" 
									readonly placeholder="No file selected" style="flex: 1; height: 32px;">
								<button type="button" class="btn btn-default btn-sm po-attach-btn" style="white-space: nowrap;">
									<i class="fa fa-link"></i> Attach
								</button>
								<button type="button" class="btn btn-default btn-sm po-clear-btn d-none" title="Clear attachment">
									<i class="fa fa-times"></i>
								</button>
							</div>
							<input type="file" class="po-file-input" style="display: none;">
						</div>
					</div>
				`;
					$poAttachmentHost.html(attachmentHtml);
					const $attachBtn = $poAttachmentHost.find(".po-attach-btn");
					const $clearBtn = $poAttachmentHost.find(".po-clear-btn");
					const $fileInput = $poAttachmentHost.find(".po-file-input");
					const $displayField = $poAttachmentHost.find(".attach-display");

					const currentValue = me.getNewOpportunityPoAttachment();
					if (currentValue) {
						const fileName = currentValue.split("/").pop();
						$displayField.val(fileName);
						$clearBtn.removeClass("d-none");
						$attachBtn.html('<i class="fa fa-pencil"></i> Change');
					}

					$attachBtn.off("click").on("click", function (e) {
						e.preventDefault();
						e.stopPropagation();
						$fileInput.click();
					});

					$clearBtn.off("click").on("click", function (e) {
						e.preventDefault();
						e.stopPropagation();
						me.setNewOpportunityPoAttachment("");
						$displayField.val("");
						$fileInput.val("");
						$clearBtn.addClass("d-none");
						$attachBtn.html('<i class="fa fa-link"></i> Attach');
					});

					$fileInput.off("change").on("change", function (e) {
						const file = this.files[0];
						if (!file) return;

						$attachBtn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> Uploading...');

						const formData = new FormData();
						formData.append('file', file);
						formData.append('is_private', 0);
						formData.append('doctype', OPP_CFG.DOCTYPE);
						formData.append('docname', '');

						fetch(`/api/method/frappe.utils.file_manager.upload_file`, {
							method: 'POST',
							body: formData,
							headers: {
								'X-Frappe-CSRF-Token': frappe.csrf_token
							}
						})
							.then(response => response.json())
							.then(data => {
								if (data.message) {
									const fileUrl = data.message.file_url;
									me.setNewOpportunityPoAttachment(fileUrl);
									const fileName = file.name;
									$displayField.val(fileName);
									$fileInput.val("");
									$clearBtn.removeClass("d-none");
									$attachBtn.prop("disabled", false).html('<i class="fa fa-pencil"></i> Change');
									frappe.show_alert({ message: __("File uploaded successfully"), indicator: "green" });
								}
							})
							.catch(err => {
								$attachBtn.prop("disabled", false).html('<i class="fa fa-link"></i> Attach');
								frappe.msgprint(__("Failed to upload file: {0}", [err.message]));
							});
					});

					this._newOppPoAttachmentControl = {
						$wrapper: $poAttachmentHost,
						get_value: () => me.getNewOpportunityPoAttachment(),
						set_value: (val) => {
							me.setNewOpportunityPoAttachment(val);
							if (val) {
								const fileName = val.split("/").pop();
								$displayField.val(fileName);
								$clearBtn.removeClass("d-none");
								$attachBtn.html('<i class="fa fa-pencil"></i> Change');
							} else {
								$displayField.val("");
								$fileInput.val("");
								$clearBtn.addClass("d-none");
								$attachBtn.html('<i class="fa fa-link"></i> Attach');
							}
						},
						refresh: () => { }
					};
				}
			}
		}

		getNewOpportunityPartyName() {
			if (this._newOppPartyControl?.get_value) {
				return String(this._newOppPartyControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityPartyName(value = "") {
			if (this._newOppPartyControl?.set_value) {
				this._newOppPartyControl.set_value(String(value || "").trim());
			}
			const $scope = $(this.page.wrapper);
			$scope.trigger("new-opp-party-changed");
		}

		getNewOpportunityContact() {
			return String(this._newOppSelectedContact || "").trim();
		}

		setNewOpportunityContact(value = "") {
			const contactValue = String(value || "").trim();
			this._newOppSelectedContact = contactValue;
			const $scope = $(this.page.wrapper);
			$scope.trigger("new-opp-contact-changed");
		}

		getNewOpportunityOwner() {
			if (this._newOppOwnerControl?.get_value) {
				return String(this._newOppOwnerControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityOwner(value = "") {
			if (this._newOppOwnerControl?.set_value) {
				this._newOppOwnerControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunityCompany() {
			if (this._newOppCompanyControl?.get_value) {
				return String(this._newOppCompanyControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityCompany(value = "") {
			if (this._newOppCompanyControl?.set_value) {
				this._newOppCompanyControl.set_value(String(value || "").trim());
			}
			const $scope = $(this.page.wrapper);
			$scope.trigger("new-opp-company-changed");
		}

		getNewOpportunityPoRefNumber() {
			const $scope = $(this.page.wrapper);
			return String($scope.find("#new-opp-po-ref-number").val() || "").trim();
		}

		setNewOpportunityPoRefNumber(value = "") {
			const $scope = $(this.page.wrapper);
			$scope.find("#new-opp-po-ref-number").val(String(value || "").trim());
		}

		getNewOpportunityPoAttachment() {
			return this._newOppPoAttachmentValue || "";
		}

		setNewOpportunityPoAttachment(value = "") {
			this._newOppPoAttachmentValue = String(value || "").trim();
		}

		getNewOpportunityCustomerAddress() {
			if (this._newOppCustomerAddressControl?.get_value) {
				return String(this._newOppCustomerAddressControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityCustomerAddress(value = "") {
			if (this._newOppCustomerAddressControl?.set_value) {
				this._newOppCustomerAddressControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunityShippingAddress() {
			if (this._newOppShippingAddressControl?.get_value) {
				return String(this._newOppShippingAddressControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityShippingAddress(value = "") {
			const normalizedValue = String(value || "").trim();
			if (this._newOppShippingAddressControl?.set_value) {
				this._newOppShippingAddressControl.set_value(normalizedValue);
			}

			// Keep billing/customer address usable when customer has only shipping address configured.
			if (normalizedValue && !this.getNewOpportunityCustomerAddress()) {
				this.setNewOpportunityCustomerAddress(normalizedValue);
			}
		}

		getNewOpportunityCompanyAddress() {
			if (this._newOppCompanyAddressControl?.get_value) {
				return String(this._newOppCompanyAddressControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityCompanyAddress(value = "") {
			if (this._newOppCompanyAddressControl?.set_value) {
				this._newOppCompanyAddressControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunityTaxCategory() {
			if (this._newOppTaxCategoryControl?.get_value) {
				return String(this._newOppTaxCategoryControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityTaxCategory(value = "") {
			if (this._newOppTaxCategoryControl?.set_value) {
				this._newOppTaxCategoryControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunityTaxTemplate() {
			if (this._newOppTaxTemplateControl?.get_value) {
				return String(this._newOppTaxTemplateControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityTaxTemplate(value = "") {
			if (this._newOppTaxTemplateControl?.set_value) {
				this._newOppTaxTemplateControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunityPaymentTermsTemplate() {
			if (this._newOppPaymentTermsControl?.get_value) {
				return String(this._newOppPaymentTermsControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityPaymentTermsTemplate(value = "") {
			if (this._newOppPaymentTermsControl?.set_value) {
				this._newOppPaymentTermsControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunityTermsTemplate() {
			if (this._newOppTermsTemplateControl?.get_value) {
				return String(this._newOppTermsTemplateControl.get_value() || "").trim();
			}
			return "";
		}

		setNewOpportunityTermsTemplate(value = "") {
			if (this._newOppTermsTemplateControl?.set_value) {
				this._newOppTermsTemplateControl.set_value(String(value || "").trim());
			}
		}

		getNewOpportunitySalesPerson() {
			return String(this._newOppSelectedSalesPerson || "").trim();
		}

		getNewOpportunitySalesTeam() {
			const rows = Array.isArray(this._newOppSelectedSalesTeam)
				? this._newOppSelectedSalesTeam
				: [];
			return rows
				.map((value) => {
					if (typeof value === "string") {
						const salesPerson = String(value || "").trim();
						if (!salesPerson) return null;
						return {
							sales_person: salesPerson,
							mobile_no: "",
							email_id: "",
							allocated_percentage: 100,
						};
					}

					const salesPerson = String(value?.sales_person || "").trim();
					if (!salesPerson) return null;

					return {
						sales_person: salesPerson,
						mobile_no: String(value?.mobile_no || "").trim(),
						email_id: String(value?.email_id || "").trim(),
						allocated_percentage: Number(value?.allocated_percentage || 100) || 100,
					};
				})
				.filter(Boolean);
		}

		setNewOpportunitySalesTeam(values = []) {
			const normalized = (Array.isArray(values) ? values : [values])
				.map((value) => {
					if (typeof value === "string") {
						const salesPerson = String(value || "").trim();
						if (!salesPerson) return null;
						return {
							sales_person: salesPerson,
							mobile_no: "",
							email_id: "",
							allocated_percentage: 100,
						};
					}

					const salesPerson = String(value?.sales_person || "").trim();
					if (!salesPerson) return null;

					return {
						sales_person: salesPerson,
						mobile_no: String(value?.mobile_no || "").trim(),
						email_id: String(value?.email_id || "").trim(),
						allocated_percentage: Number(value?.allocated_percentage || 100) || 100,
					};
				})
				.filter(Boolean);

			const uniqueMap = new Map();
			normalized.forEach((entry) => {
				uniqueMap.set(entry.sales_person, entry);
			});

			const unique = Array.from(uniqueMap.values());
			this._newOppSelectedSalesTeam = unique;
			this._newOppSelectedSalesPerson = unique[0]?.sales_person || "";

			const $scope = $(this.page.wrapper);
			$scope.trigger("new-opp-sales-team-changed");
		}

		setNewOpportunitySalesPerson(value = "") {
			const salesPersonValue = String(value || "").trim();
			this.setNewOpportunitySalesTeam(
				salesPersonValue
					? [{ sales_person: salesPersonValue, mobile_no: "", email_id: "", allocated_percentage: 100 }]
					: []
			);
		}

		initNewOpportunityDefaults() {
			const $scope = $(this.page.wrapper);

			this.ensureNewOpportunityControls();

			$scope.find("#new-opp-party-label").text("Customer");
			this.setNewOpportunitySalesTeam([]);
			this.setNewOpportunityPartyName("");
			this.setNewOpportunityContact(this._currentContactId || "");
			$scope.find("#new-opp-subject").val("");
			this.setNewOpportunityPoRefNumber("");
			this.setNewOpportunityPoAttachment("");
			$scope.find("#new-opp-terms-and-conditions").html("");
			this.setNewOpportunityCompany(frappe.defaults.get_default("Company") || "");
			this.setNewOpportunityCustomerAddress("");
			this.setNewOpportunityShippingAddress("");
			this.setNewOpportunityCompanyAddress("");
			this.setNewOpportunityTaxCategory("");
			this.setNewOpportunityTaxTemplate("");
			this.setNewOpportunityPaymentTermsTemplate("");
			this.setNewOpportunityTermsTemplate("Standard_Terms and Conditions");
			const today = frappe.datetime.nowdate();
			$scope.find("#new-opp-transaction-date").val(today);
			$scope.find("#new-opp-valid-till").val(frappe.datetime.add_days(today, 7));
			$scope.find("#new-opp-billing-address-gstin, #new-opp-shipping-address-gstin, #new-opp-company-address-gstin").val("");
			$scope.find("#new-opp-billing-address-display, #new-opp-shipping-address-display, #new-opp-company-address-display").val("");
			this._newOppValidTillManuallyChanged = false;
			this._newOppTaxCategoryManuallyChanged = false;
			this._newOppTaxTemplateManuallyChanged = false;
			this._newOppPaymentTermsManuallyChanged = false;
			this._newOppSourceOpportunity = "";
			if (this._newOppSalesPersonControl?.set_value) {
				this._newOppSalesPersonControl.set_value("");
			}
			$scope.find("#new-opp-sales-person-display").html("");
			this._newOppContactList = [];
			$scope.find("#new-opp-items-table-body").html("");
			$scope.find("#new-opp-save").prop("disabled", false).text("Create Customer Order Form");
			$scope.trigger("new-opp-contact-changed");
			$scope.trigger("new-opp-sales-team-changed");
			this.gotoNewWizardStep(1);
		}

		bindLineItemsFullWidth() {
			$(window)
				.off("resize.oppLineItemsWidth")
				.on("resize.oppLineItemsWidth", () => {
					this.updateLineItemsFullWidth();
				});

			const $scrollContainers = $(this.page.wrapper).find(".detail-card--lineitems .table-wrap, #new-opp-items-table-wrap, .new-opp-item-inline-editor-wrap");
			const setLineItemsScroll = function () {
				const scrollLeft = this.scrollLeft || 0;
				const root = this.closest(".detail-card--lineitems, #new-opp-items-table-wrap") || this;
				if (root && root.style) {
					root.style.setProperty("--line-items-scroll", `${scrollLeft}px`);
				}
			};

			$scrollContainers
				.off("scroll.oppLineItemsSticky")
				.on("scroll.oppLineItemsSticky", setLineItemsScroll);

			setTimeout(() => this.updateLineItemsFullWidth(), 0);
			setTimeout(() => this.updateLineItemsFullWidth(), 120);
		}

		updateLineItemsFullWidth() {
			const $scope = this.getPageScope();
			const wrapper = $scope.find(".customer-order-forms-details .detail-view-wrapper, .quotation-list-details .detail-view-wrapper").get(0);
			if (!wrapper) return;

			if (window.matchMedia("(max-width: 1100px)").matches) {
				wrapper.style.setProperty("--line-items-extra", "0px");
				wrapper.style.setProperty("--line-items-shift", "0px");
				return;
			}

			const panel = wrapper.querySelector(".detail-panel");
			const lineItemsCard = wrapper.querySelector(".detail-card--lineitems");
			if (!panel) {
				wrapper.style.setProperty("--line-items-extra", "0px");
				wrapper.style.setProperty("--line-items-shift", "0px");
				return;
			}

			const styles = window.getComputedStyle(wrapper);
			const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
			const panelRect = panel.getBoundingClientRect();
			const extra = Math.max(0, Math.round(panelRect.width + gap));
			wrapper.style.setProperty("--line-items-extra", `${extra}px`);

			if (!lineItemsCard) {
				wrapper.style.setProperty("--line-items-shift", "0px");
				return;
			}

			const wrapperRect = wrapper.getBoundingClientRect();
			const lineRect = lineItemsCard.getBoundingClientRect();
			const panelBottom = panelRect.bottom - wrapperRect.top;
			const lineTop = lineRect.top - wrapperRect.top;
			const shift = Math.max(0, Math.ceil(panelBottom - lineTop + 12));
			wrapper.style.setProperty("--line-items-shift", `${shift}px`);
		}

		attachInlineLinkPortal(control) {
			const $input = control?.$input;
			if (!$input || !$input.length) return;

			const inputEl = $input.get(0);
			const host = inputEl?.closest(".awesomplete");
			const listEl = host ? host.querySelector("ul") : null;
			if (!listEl) return;

			if (!listEl.classList.contains("inline-link-portal-list")) {
				listEl.classList.add("inline-link-portal-list");
				document.body.appendChild(listEl);
			}

			const positionList = () => {
				const rect = inputEl.getBoundingClientRect();
				if (!rect.width || !rect.height) {
					listEl.style.display = "none";
					return;
				}

				const isOutOfView = rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth;
				if (isOutOfView) {
					listEl.style.display = "none";
					return;
				}

				let top = rect.bottom + 4;
				let maxH = window.innerHeight - top - 10;
				if (maxH < 120) {
					const aboveH = Math.min(260, Math.max(120, rect.top - 10));
					top = Math.max(10, rect.top - aboveH - 4);
					maxH = aboveH;
				} else {
					maxH = Math.min(260, maxH);
				}

				listEl.style.left = `${Math.round(rect.left)}px`;
				listEl.style.top = `${Math.round(top)}px`;
				listEl.style.width = `${Math.max(Math.round(rect.width), 220)}px`;
				listEl.style.maxHeight = `${Math.round(maxH)}px`;
				listEl.style.display = "block";
			};

			const hideList = () => {
				listEl.style.display = "none";
			};

			$input.off("focus.inlinePortal input.inlinePortal keyup.inlinePortal click.inlinePortal blur.inlinePortal");
			$input.on("focus.inlinePortal input.inlinePortal keyup.inlinePortal click.inlinePortal", () => {
				setTimeout(positionList, 0);
				setTimeout(positionList, 70);
			});
			$input.on("blur.inlinePortal", () => {
				setTimeout(() => {
					const active = document.activeElement;
					if (active !== inputEl && !listEl.contains(active)) {
						hideList();
					}
				}, 150);
			});

			if (!control.__inlinePortalScrollBound) {
				const handleViewportChange = () => {
					if (document.activeElement === inputEl) {
						positionList();
					} else {
						hideList();
					}
				};
				window.addEventListener("scroll", handleViewportChange, true);
				window.addEventListener("resize", handleViewportChange, true);
				control.__inlinePortalScrollBound = true;
			}
		}

		ensureItemLinkSelectorPatched() {
			const LinkSelector = frappe?.ui?.form?.LinkSelector;
			if (!LinkSelector || LinkSelector.__renewalItemSearchPatched) return;

			if (!document.getElementById("item-advanced-search-full-width-style")) {
				const styleEl = document.createElement("style");
				styleEl.id = "item-advanced-search-full-width-style";
				styleEl.textContent = `
				.item-advanced-search-full-width .modal-dialog {
					width: min(90vw, 1400px) !important;
					max-width: min(90vw, 1400px) !important;
					margin: 20px auto !important;
				}
				.item-advanced-search-full-width .modal-content {
					max-height: calc(100vh - 16px) !important;
				}
				.item-advanced-search-full-width .modal-body {
					max-height: calc(100vh - 170px) !important;
					overflow: auto !important;
				}
				.item-advanced-search-full-width .custom-item-advanced-search,
				.item-advanced-search-full-width .custom-item-filter-row,
				.item-advanced-search-full-width .frappe-control,
				.item-advanced-search-full-width .awesomplete {
					overflow: visible !important;
				}
				.item-advanced-search-full-width .awesomplete > ul {
					z-index: 1065 !important;
					max-height: 220px !important;
					overflow-y: auto !important;
				}
			`;
				document.head.appendChild(styleEl);
			}

			if (!frappe.__renewalItemLinkSearchPatched && typeof frappe.link_search === "function") {
				const originalLinkSearch = frappe.link_search;
				const customQueryMethod =
					"renewal_module.custom_module.page.customer_order_forms.customer_order_forms.search_items_for_link";

				frappe.link_search = function (doctype, args, callback, btn) {
					const queryMethod = args?.query;
					if (queryMethod !== customQueryMethod) {
						return originalLinkSearch.call(this, doctype, args, callback, btn);
					}

					const safeArgs = Object.assign({}, args || {}, { doctype, searchfield: args?.searchfield || "name" });
					let retried = false;

					const execute = () => {
						frappe.call({
							method: "frappe.desk.search.search_widget",
							type: "GET",
							args: safeArgs,
							btn,
							callback: function (r) {
								callback && callback(r?.message || []);
							},
							error: function (err) {
								const message = String(err?.message || err?.exception || err?.statusText || "");
								const canRetry = !retried && /(network changed|err_network_changed|failed to fetch|networkerror)/i.test(message);

								if (canRetry) {
									retried = true;
									setTimeout(execute, 350);
									return;
								}

								callback && callback([]);
								frappe.show_alert({
									message: __("Search interrupted by network/security layer. Please retry."),
									indicator: "orange",
								}, 5);
							},
						});
					};

					execute();
				};

				frappe.__renewalItemLinkSearchPatched = true;
			}

			const originalMake = LinkSelector.prototype.make;

			LinkSelector.prototype.make = function () {
				originalMake.call(this);

				if (!this.custom_item_search || this.doctype !== "Item") return;

				const txtField = this.dialog?.fields_dict?.txt;
				const resultsField = this.dialog?.fields_dict?.results;
				if (!txtField?.$wrapper?.length || !resultsField?.$wrapper?.length) return;

				this.dialog.$wrapper?.addClass("item-advanced-search-full-width");

				this.dialog.$wrapper.find(".custom-item-advanced-search").remove();
				txtField.$wrapper.addClass("d-none");

				const state = this.target?._itemAdvancedSearchState || {};
				const $filters = $(
					`<div class="custom-item-advanced-search mb-3" style="padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
					<div class="custom-item-filter-row" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;overflow:visible;">
						<div style="min-width:170px;flex:1 1 170px;">
							<label class="small text-muted d-block mb-1">Brand</label>
							<div id="item-filter-brand-link-control"></div>
						</div>
						<div style="min-width:170px;flex:1 1 170px;">
							<label class="small text-muted d-block mb-1">Item Group</label>
							<div id="item-filter-item-group-link-control"></div>
						</div>
						<div style="min-width:190px;flex:1 1 190px;">
							<label class="small text-muted d-block mb-1">Product</label>
							<div id="item-filter-product-link-control"></div>
						</div>
						<div style="min-width:130px;flex:0 0 130px;">
							<label class="small text-muted d-block mb-1">Tenure</label>
							<select class="form-control form-control-sm" data-item-filter="tenure">
								<option value="">Select</option>
								<option value="Years">Years</option>
								<option value="Months">Months</option>
							</select>
						</div>
						<div style="min-width:150px;flex:0 0 150px;">
							<label class="small text-muted d-block mb-1">Years/Months</label>
							<input type="text" class="form-control form-control-sm" data-item-filter="years_months" placeholder="Enter value">
						</div>
					</div>
				</div>`
				);

				$filters.find("[data-item-filter]").each(function () {
					const fieldname = $(this).data("itemFilter");
					$(this).val(state[fieldname] || "");
				});

				resultsField.$wrapper.before($filters);

				const runSearch = () => {
					this.start = 0;
					this.search();
				};

				// Debounced auto-search for text inputs
				let _searchTimer = null;
				const debouncedSearch = () => {
					clearTimeout(_searchTimer);
					_searchTimer = setTimeout(runSearch, 400);
				};

				const createLinkFilterControl = (hostId, fieldname, options, placeholder) => {
					const $host = $filters.find(`#${hostId}`);
					if (!$host.length || !frappe?.ui?.form?.make_control) return null;
					$host.empty();

					const linkControl = frappe.ui.form.make_control({
						parent: $host,
						only_input: true,
						df: {
							fieldtype: "Link",
							fieldname: `item_filter_${fieldname}`,
							options,
							label: "",
							placeholder,
							get_query: () => (options === "Item" ? { filters: { disabled: 0 } } : {}),
							onchange: () => {
								const val = String(linkControl?.get_value?.() || "").trim();
								if (this.target?._itemAdvancedSearchState) {
									this.target._itemAdvancedSearchState[fieldname] = val;
								}
								debouncedSearch();
							},
						},
						render_input: true,
					});

					if (state[fieldname]) {
						linkControl.set_value(state[fieldname]);
					}
					return linkControl;
				};

				createLinkFilterControl("item-filter-brand-link-control", "brand", "Brand", "Search brand");
				createLinkFilterControl("item-filter-item-group-link-control", "item_group", "Item Group", "Search item group");
				createLinkFilterControl("item-filter-product-link-control", "product", "Item", "Search product");

				// Update state for all filter fields (input for text, change for select)
				$filters.on("input change", "[data-item-filter]", (event) => {
					const $el = $(event.currentTarget);
					const fieldname = $el.data("itemFilter");
					if (this.target?._itemAdvancedSearchState) {
						this.target._itemAdvancedSearchState[fieldname] = String($el.val() || "").trim();
					}
					// Auto-search: immediately for select, debounced for text inputs
					if ($el.is("select")) {
						runSearch();
					} else {
						debouncedSearch();
					}
				});

				// Enter key is handled by Link control/awesomplete for selection.
			};

			LinkSelector.__renewalItemSearchPatched = true;
		}

		configureItemAdvancedSearch(control) {
			if (!control || control.__itemAdvancedSearchConfigured) return;

			this.ensureItemLinkSelectorPatched();
			control.__itemAdvancedSearchConfigured = true;
			control._itemAdvancedSearchState = {
				brand: "",
				item_group: "",
				product: "",
				tenure: "",
				years_months: "",
			};

			const originalSetCustomQuery =
				typeof control.set_custom_query === "function"
					? control.set_custom_query.bind(control)
					: null;

			control.set_custom_query = (args) => {
				if (originalSetCustomQuery) originalSetCustomQuery(args);

				args.query = "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.search_items_for_link";
				args.filters = Object.assign({}, args.filters || {}, {
					disabled: 0,
					brand: control._itemAdvancedSearchState.brand || "",
					item_group: control._itemAdvancedSearchState.item_group || "",
					product: control._itemAdvancedSearchState.product || "",
					tenure: control._itemAdvancedSearchState.tenure || "",
					years_months: control._itemAdvancedSearchState.years_months || "",
				});
			};

			control.open_advanced_search = function () {
				const doctype = this.get_options();
				if (!doctype) return false;

				const linkSelector = new frappe.ui.form.LinkSelector({
					doctype,
					target: this,
					txt: this.get_input_value(),
					custom_item_search: true,
				});

				if (linkSelector?.dialog) {
					linkSelector.dialog.set_size?.("extra-large");
					const $wrapper = linkSelector.dialog.$wrapper;
					$wrapper?.addClass("item-advanced-search-full-width");
					$wrapper?.find(".modal-dialog").css({
						width: "90vw",
						maxWidth: "1400px",
					});
				}

				return false;
			};
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

		/**
		 * Fetch paged Opportunity rows with basic filters and advanced filters.
		 * - Accepts `override_filters` to force values during URL restore.
		 * - Updates counts and renders rows.
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

			// me.active_probability = Object.prototype.hasOwnProperty.call(override_filters, "probability")
			//   ? (override_filters.probability || "")
			//   : (me.active_probability || "");

			// owners (array)
			me.selectedOwners = Object.prototype.hasOwnProperty.call(override_filters, "owners")
				? normalizeCSVorArray(override_filters.owners)
				: (me.selectedOwners || []);

			const statusVal = me.active_status || "";
			// const probBucket = me.active_probability || "";  // e.g., "50-75"
			const owners = normalizeCSVorArray(me.selectedOwners);

			// ---- normalize advanced filters (saved_filters) to [field, operator, value] ----
			const normalizedFilters = (saved_filters || []).map(f => {
				// Frappe filter array forms: [Doctype, field, operator, value, ...] OR [field, operator, value]
				if (Array.isArray(f)) {
					// For 4+ assume shape like [DT, field, operator, value, ...]; take [field, operator, value]
					const arr = f.length >= 4 ? f.slice(1, 4) : f.slice(0, 3);
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
						// probability: probBucket,   // handled server-side as buckets
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
        <tr><td colspan="11" class="text-center text-muted py-4">No Customer Order Forms found.</td></tr>
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
				const stage = doc[OPP_CFG.STATUS_FIELD] || doc.status || "";
				// const prob = (doc[OPP_CFG.PROBABILITY_FIELD] ?? "");
				const amount = getQuotationAmount(doc);
				const validTill = doc[OPP_CFG.VALID_TILL_FIELD] || "";
				const owner = doc[OPP_CFG.WORK_OWNER_FIELD] || doc.owner || "";

				const tr = document.createElement("tr");
				tr.innerHTML = `
					<td class="checkbox-cell"><input type="checkbox" class="form-check-input form-check-input-light"></td>
					<td><a class="doc-link ids link-reset" data-doc-name="${frappe.utils.escape_html(name)}" href="/app/${OPP_CFG.ROUTE}/${encodeURIComponent(name)}">${frappe.utils.escape_html(name)}</a></td>
					<td class="ellipsis" title="${frappe.utils.escape_html(title)}">${frappe.utils.escape_html(title)}</td>
					<td class="ellipsis" title="${frappe.utils.escape_html(party)}">${frappe.utils.escape_html(party)}</td>
					<td><span class="pill ${this.getStageClass(stage)} text-truncate" title="${frappe.utils.escape_html(stage)}">${frappe.utils.escape_html(stage)}</span></td>
					
					<td class="ellipsis" title="${frappe.utils.escape_html(fmtCurrency(amount))}">${fmtCurrency(amount)}</td>
					<td class="ellipsis" title="${frappe.utils.escape_html((owner))}">${frappe.utils.escape_html(owner)}</td>
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

			this.scheduleFilterCountSync?.();

			// Row link navigation + persist filters
			$(wrapper).off("click", ".doc-link").on("click", ".doc-link", (e) => {
				e.preventDefault();
				const name = $(e.currentTarget).data("doc-name");
				if (!name) return;
				try {
					localStorage.setItem(OPP_CFG.LS.last_filters, window.location.search || "");
					localStorage.setItem(OPP_CFG.LS.page_len, String(this.page_length));
				} catch { }
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
      ${visible.map((u, i) => `
        <div class="assign-avatar" title="${frappe.utils.escape_html(u.full_name || u.name)}" style="margin-left:${i === 0 ? 0 : "-8px"}">
          ${u.user_image ? `<img src="${frappe.utils.get_file_link(u.user_image)}">`
					: `<div class="assign-avatar assign-initials">${this.initials(u.full_name || u.name)}</div>`}
        </div>`).join("")}
      ${extra > 0 ? `
        <div class="assign-avatar" style="margin-left:-8px;background:#6c757d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;"
          title="${docs.slice(3).map(u => u.full_name).join(", ")}">+${extra}</div>` : ""}
    `;
		}


		async load_doc_details(name) {
			const requestToken = `${name}::${Date.now()}`;
			this._detailLoadRequestToken = requestToken;
			const $scope = this.getPageScope();  // Get the correct scope where template is rendered

			const d = await frappe.call({
				method: "frappe.client.get",
				args: { doctype: OPP_CFG.DOCTYPE, name, fields: ["*"] }
			}).then(r => r.message || {});

			if (this._detailLoadRequestToken !== requestToken) return;

			this._currentOpportunityName = d.name || name;
			this._currentOpportunityDoc = d;

			// Extract data
			const titleVal = d[OPP_CFG.TITLE_FIELD] || d.name || "";
			const party = d[OPP_CFG.PARTY_NAME_FIELD] || d.customer || d.lead || "";
			const salesStage = d[OPP_CFG.STATUS_FIELD] || "";
			const statusVal = d.status || d.workflow_state || "";
			const docstatus = Number(d.docstatus || 0);
			const amount = getQuotationAmount(d);
			const validTill = d[OPP_CFG.VALID_TILL_FIELD] || "";
			const industryType = d.industry_type || d.industry || d.customer_group || "";
			const companyDetails = d.company || d.company_name || d.organization || d[OPP_CFG.PARTY_NAME_FIELD] || d.customer || d.lead || "";
			const sourceOpportunity = String(d.quotation_id || d.prevdoc_docname || "").trim();
			const poRefNumber = String(d.po_ref_number || d.po_no || "").trim();
			const poAttachment = String(d.custom_po_attachment || d.customer_po || "").trim();
			const description = String(d.description || d.remarks || "").trim();

			if (!$scope.find("#detail-po-ref-number").length || !$scope.find("#detail-po-attachment").length) {
				const $opportunityRowInner = $scope.find("#detail-opportunity").closest(".info-row");
				if ($opportunityRowInner.length) {
					$opportunityRowInner.after(`
					<div class="info-grid info-grid--2col" style="margin-top:10px;">
						<div class="info-col">
							<div class="info-row">
								<span class="label with-action">PO REF NUMBER <i id="detail-edit-po-btn" class="fa fa-pencil" title="Edit PO Details"></i></span>
								<div class="value" id="detail-po-ref-number">-</div>
							</div>
						</div>
						<div class="info-col">
							<div class="info-row">
								<span class="label">PO ATTACHMENT</span>
								<div class="value" id="detail-po-attachment">-</div>
							</div>
						</div>
					</div>
				`);
				}
			}

			// Update brand/header section
			$scope.find("#detail-customer-name").text(d.customer).attr("title", d.customer || "");
			$scope.find("#detail-name").text(d.name);
			const detailStatusText = statusVal || salesStage || "-";
			const detailBadgeClass = this.getDetailStatusBadgeClass(detailStatusText);
			$scope.find("#detail-status-badge")
				.text(detailStatusText)
				.removeClass("badge--success badge--danger badge--warning badge--orange badge--blue")
				.addClass(detailBadgeClass);
			$scope.find("#detail-deal-id").text(d.name);
			$scope.find("#detail-header-id").text(d.subject || d.name || "-").attr("title", d.subject || d.name || "-");
			$scope.find("#detail-header-title").text(titleVal || "-").attr("title", titleVal || "-");

			// Update amount
			const amountFormatted = fmtCurrency(amount);
			$scope.find("#detail-amount").text(amountFormatted);

			// Update info grid
			$scope.find("#detail-status").text(statusVal || "-");
			$scope.find("#detail-header-status").text(salesStage || "-");
			$scope.find("#detail-closure-date").text(validTill ? frappe.datetime.str_to_user(validTill) : "-");
			$scope.find("#detail-basic-valid-till").text(validTill ? frappe.datetime.str_to_user(validTill) : "-");
			$scope.find("#detail-industry-type").text(industryType || "-");
			$scope.find("#detail-customer-name").text(party || "-").attr("title", party || "-");
			$scope.find("#detail-company-name").text(companyDetails || "-").attr("title", companyDetails || "-");
			$scope.find("#detail-po-ref-number").text(poRefNumber || "-").attr("title", poRefNumber || "-");

			const $poAttachment = $scope.find("#detail-po-attachment");
			if ($poAttachment.length) {
				$poAttachment.empty();
				if (poAttachment) {
					const attachmentHref = poAttachment.startsWith("/")
						? poAttachment
						: (frappe?.utils?.get_file_link ? frappe.utils.get_file_link(poAttachment) : poAttachment);
					const attachmentLabel = poAttachment.split("/").pop() || "Attachment";
					$("<a>")
						.addClass("link-reset")
						.attr("href", attachmentHref)
						.attr("target", "_blank")
						.attr("rel", "noopener noreferrer")
						.attr("title", poAttachment)
						.text(attachmentLabel)
						.appendTo($poAttachment);
				} else {
					$poAttachment.text("-").attr("title", "");
				}
			}

			const $opportunity = $scope.find("#detail-opportunity");
			if ($opportunity.length) {
				if (sourceOpportunity) {
					const safeOpportunity = frappe.utils.escape_html(sourceOpportunity);
					const opportunityHref = `/app/quotation-list/${encodeURIComponent(sourceOpportunity)}`;
					$opportunity
						.html(`<a class="link-reset" href="${opportunityHref}" title="${safeOpportunity}">${safeOpportunity}</a>`)
						.attr("title", sourceOpportunity);
				} else {
					$opportunity.text("-").attr("title", "");
				}
			}
			await this.refreshDetailWorkflowActions(d, $scope);
			this.setDescriptionSection(description, $scope);

			// Contact person section (ticket-like interactive section)
			await this.renderOpportunityContactSection(d, $scope);
			if (this._detailLoadRequestToken !== requestToken) return;
			await this.renderOpportunitySalesTeamSection(d, $scope);
			if (this._detailLoadRequestToken !== requestToken) return;
			await this.renderOpportunityAddressSection(d, $scope);
			if (this._detailLoadRequestToken !== requestToken) return;
			this.hideRightPanelPersonCard();
			await this.ensureItemCodeSuggestions();
			if (this._detailLoadRequestToken !== requestToken) return;

			// Render items/products table if available
			await this.renderOpportunityItems(d, $scope);
			this.bindOpportunityItemRowActions();
			if (this._detailLoadRequestToken !== requestToken) return;

			await this.renderQuotationTaxesSection(d, $scope);
			if (this._detailLoadRequestToken !== requestToken) return;
			await this.renderQuotationPaymentTermsSection(d, $scope);
			if (this._detailLoadRequestToken !== requestToken) return;
			this.renderQuotationTermsSection(d, $scope);
			this.renderOrderSummary(d, $scope);

			// Assigned avatars (from _assign)
			if (d._assign) {
				const users = JSON.parse(d._assign || "[]");
				const map = await this.fetchUsersBasic(users);
			}

			function getInitials(name) {
				const p = (name || "User").trim().split(/\s+/);
				return ((p[0]?.[0] || "U") + (p[p.length - 1]?.[0] || "")).toUpperCase();
			}
		}

		async refreshDetailWorkflowActions(doc) {
			const $dropdown = $("#detail-workflow-dropdown");
			const $btn = $("#detail-workflow-btn");
			const $menu = $("#detail-workflow-menu");

			if (!$dropdown.length || !$btn.length || !$menu.length) return;

			$menu.empty();
			$btn.prop("disabled", true).addClass("custom-workflow-btn");
			$dropdown.addClass("d-none");

			if (!doc || !doc.name) return;

			try {
				const response = await frappe.call({
					method: "frappe.model.workflow.get_transitions",
					args: { doc },
				});

				const transitions = Array.isArray(response?.message) ? response.message : [];
				if (!transitions.length) return;

				transitions.forEach((transition) => {
					const action = String(transition?.action || "").trim();
					if (!action) return;
					const nextState = String(transition?.state || "").trim();
					const safeAction = frappe.utils.escape_html(action);
					const safeState = frappe.utils.escape_html(nextState);
					$menu.append(`<li><a class="dropdown-item" href="#" data-workflow-action="${safeAction}" data-next-state="${safeState}">${safeAction}</a></li>`);
				});

				if ($menu.children().length) {
					$dropdown.removeClass("d-none");
					$btn.prop("disabled", false);
				}

				// Handle workflow action click
				$menu.off("click.workflow").on("click.workflow", "a", async (e) => {
					e.preventDefault();
					const $item = $(e.currentTarget);
					const action = $item.data("workflow-action");
					const nextState = $item.data("next-state");
					if (!action || !nextState) return;
					// Call backend to apply workflow action
					try {
						const r = await frappe.call({
							method: "frappe.model.workflow.apply_workflow", // standard Frappe method
							args: {
								doc: doc,
								action: action
							},
						});
						if (!r.exc) {
							// Update status and workflow_status in UI
							const newStatus = nextState;
							$("#detail-status-badge").text(newStatus).attr("class", "badge " + this.getDetailStatusBadgeClass(newStatus));
							doc.status = newStatus;
							doc.workflow_status = newStatus;
							frappe.show_alert({ message: __(`Status updated to ${newStatus}`), indicator: 'green' });
							// Refresh actions
							await this.refreshDetailWorkflowActions(doc);
						} else {
							frappe.show_alert({ message: __('Failed to update status'), indicator: 'red' });
						}
					} catch (err) {
						frappe.show_alert({ message: __('Failed to update status'), indicator: 'red' });
					}
				});
			} catch (e) {
				$dropdown.addClass("d-none");
			}
		}

		setDescriptionSection(rawDescription = "") {
			const normalized = this.normalizeRichTextContent(String(rawDescription || "").trim());
			const plainText = (frappe.utils.strip_html
				? frappe.utils.strip_html(normalized)
				: $("<div>").html(normalized).text()).replace(/\u00a0/g, " ").trim();

			this._detailDescriptionOriginal = plainText;

			const safeHtml = plainText
				? frappe.utils.escape_html(plainText).replace(/\n/g, "<br>")
				: "<span class='muted'>No description</span>";

			$("#detail-opportunity-description").html(safeHtml).removeClass("d-none");
			$("#detail-description-editor-wrap").addClass("d-none");
			$("#detail-description-editor").val(plainText);
			$("#detail-description-edit-btn").removeClass("d-none");
		}

		bindDescriptionEditor(name) {
			const me = this;
			const docname = String(name || this._currentOpportunityName || "").trim();
			const $scope = $(this.page.wrapper);

			$scope
				.off("click", "#detail-description-edit-btn")
				.on("click", "#detail-description-edit-btn", function (e) {
					e.preventDefault();
					$("#detail-opportunity-description").addClass("d-none");
					$("#detail-description-editor-wrap").removeClass("d-none");
					$("#detail-description-edit-btn").addClass("d-none");
					$("#detail-description-editor").focus();
				});

			$scope
				.off("click", "#detail-description-cancel-btn")
				.on("click", "#detail-description-cancel-btn", function (e) {
					e.preventDefault();
					me.setDescriptionSection(me._detailDescriptionOriginal || "");
				});

			$scope
				.off("click", "#detail-description-save-btn")
				.on("click", "#detail-description-save-btn", function (e) {
					e.preventDefault();
					const updatedDescription = String($("#detail-description-editor").val() || "").trim();
					const activeName = String(me._currentOpportunityName || docname || "").trim();
					if (!activeName) {
						frappe.msgprint(__("Quotation is not available"));
						return;
					}

					const tryFieldSave = (fieldname) => {
						return frappe.call({
							method: "frappe.client.set_value",
							args: {
								doctype: OPP_CFG.DOCTYPE,
								name: activeName,
								fieldname,
								value: updatedDescription,
							},
						});
					};

					tryFieldSave("description")
						.then(() => {
							me._currentOpportunityDoc = me._currentOpportunityDoc || {};
							me._currentOpportunityDoc.description = updatedDescription;
							me.setDescriptionSection(updatedDescription);
							frappe.show_alert({ message: __("Description updated"), indicator: "green" });
						})
						.catch(() => {
							tryFieldSave("remarks")
								.then(() => {
									me._currentOpportunityDoc = me._currentOpportunityDoc || {};
									me._currentOpportunityDoc.remarks = updatedDescription;
									me.setDescriptionSection(updatedDescription);
									frappe.show_alert({ message: __("Description updated"), indicator: "green" });
								})
								.catch(() => {
									frappe.msgprint(__("Failed to update description"));
								});
						});
				});
		}

		setAnalyticsLoadingState() {
			const $pie = $("#chart-brand-pie");
			const $brandLegend = $("#chart-brand-data");
			const $stageBars = $("#chart-stage-bars");
			const $stageLegend = $("#chart-stage-data");
			const $salesBars = $("#chart-sales-bars");
			const $salesLegend = $("#chart-sales-profit-data");

			if ($pie.length) {
				$pie.css("background", "conic-gradient(#e5e7eb 0 360deg)");
			}
			if ($brandLegend.length) {
				$brandLegend.text("Loading analytics...");
			}
			if ($stageBars.length) {
				$stageBars.html('<div class="chart-empty">Loading analytics...</div>');
			}
			if ($stageLegend.length) {
				$stageLegend.text("Stage insights will appear here.");
			}
			if ($salesBars.length) {
				$salesBars.html('<div class="chart-empty">Loading analytics...</div>');
			}
			if ($salesLegend.length) {
				$salesLegend.text("Sales and profit breakdown will appear here.");
			}

			this.hideChartHoverTooltip();
		}

		async getOpportunityAnalytics(opportunityName) {
			if (!opportunityName) return null;
			try {
				const r = await frappe.call({
					method: OPP_CFG.API.get_quotation_analytics,
					args: { opportunity: opportunityName },
				});
				return r?.message || null;
			} catch (e) {
				return null;
			}
		}

		async ensureItemCodeSuggestions() {
			if (Array.isArray(this._itemCodeSuggestions) && this._itemCodeSuggestions.length) {
				this.renderItemCodeDatalist();
				return;
			}

			try {
				const list = await frappe.db.get_list("Item", {
					fields: ["item_code", "item_name"],
					filters: { disabled: 0 },
					order_by: "item_code asc",
					limit: 500,
				});

				this._itemCodeSuggestions = (list || [])
					.map((row) => ({
						item_code: row.item_code || "",
						item_name: row.item_name || "",
					}))
					.filter((row) => row.item_code);
			} catch (e) {
				this._itemCodeSuggestions = [];
				console.warn("Unable to load item codes:", e);
			}

			this.renderItemCodeDatalist();
		}

		renderItemCodeDatalist() {
			const $list = $("#item-code-suggestions");
			if (!$list.length) return;

			const options = (this._itemCodeSuggestions || []).map((row) => {
				const code = frappe.utils.escape_html(row.item_code || "");
				const name = frappe.utils.escape_html(row.item_name || "");
				return `<option value="${code}" label="${name}"></option>`;
			}).join("");

			$list.html(options);
		}

		async getOpportunityItemFieldMeta() {
			if (this._opportunityItemFieldMeta) return this._opportunityItemFieldMeta;

			const sourceDoc = this._currentOpportunityDoc || {};
			const childDoctype = (sourceDoc.items && sourceDoc.items[0]?.doctype) || "Opportunity Item";
			await frappe.model.with_doctype(childDoctype);

			const getDf = (fieldname) => frappe.meta.get_docfield(childDoctype, fieldname) || {};
			const firstAvailableDf = (candidates = []) => {
				for (const fieldname of candidates) {
					const df = getDf(fieldname);
					if (df && df.fieldname) {
						return { fieldname, df };
					}
				}
				return { fieldname: candidates[0] || "", df: {} };
			};

			const opportunityTypeMeta = firstAvailableDf(["renewal_status", "opportunity_type", "custom_opportunity_type"]);
			const renewalIdDf = getDf("renewal_id");

			this._opportunityItemFieldMeta = {
				childDoctype,
				opportunity_type: {
					fieldname: opportunityTypeMeta.fieldname || "opportunity_type",
					fieldtype: opportunityTypeMeta.df.fieldtype || "Data",
					options: opportunityTypeMeta.df.options || "",
				},
				renewal_id: {
					fieldtype: renewalIdDf.fieldtype || "Data",
					options: renewalIdDf.options || "",
				},
			};

			return this._opportunityItemFieldMeta;
		}

		async getOpportunityRenewalDoctype() {
			if (Object.prototype.hasOwnProperty.call(this, "_detailRenewalDoctype")) {
				return this._detailRenewalDoctype;
			}

			this._detailRenewalDoctype = "";
			try {
				await frappe.model.with_doctype("Opportunity Item");
				const renewalDf = frappe.meta.get_docfield("Opportunity Item", "renewal_id");
				this._detailRenewalDoctype = String(renewalDf?.options || "").trim();
			} catch (e) {
				this._detailRenewalDoctype = "";
			}

			const tryDoctypes = [this._detailRenewalDoctype, "Renewal List", "Renewal"]
				.map((value) => String(value || "").trim())
				.filter((value, idx, arr) => value && arr.indexOf(value) === idx);

			for (const doctypeName of tryDoctypes) {
				try {
					await frappe.model.with_doctype(doctypeName);
					this._detailRenewalDoctype = doctypeName;
					break;
				} catch (e) {
					// try next doctype candidate
				}
			}

			return this._detailRenewalDoctype;
		}

		async getOpportunityRenewalCustomerFilterField() {
			if (Object.prototype.hasOwnProperty.call(this, "_detailRenewalCustomerFilterField")) {
				return this._detailRenewalCustomerFilterField;
			}

			this._detailRenewalCustomerFilterField = "";
			const renewalDoctype = await this.getOpportunityRenewalDoctype();
			if (!renewalDoctype) return "";

			try {
				await frappe.model.with_doctype(renewalDoctype);
				const renewalMeta = frappe.get_meta(renewalDoctype);
				const candidates = ["customer", "customer", "customer_name"];
				this._detailRenewalCustomerFilterField = candidates.find((fieldname) =>
					renewalMeta?.fields?.some((df) => df.fieldname === fieldname)
				) || "";
			} catch (e) {
				this._detailRenewalCustomerFilterField = "";
			}

			return this._detailRenewalCustomerFilterField;
		}

		getCurrentOpportunityCustomerName() {
			const doc = this._currentOpportunityDoc || {};
			return String(
				doc.customer
				|| doc.customer
				|| doc[OPP_CFG.PARTY_NAME_FIELD]
				|| ""
			).trim();
		}

		async getItemAutofill(itemCode) {
			const code = (itemCode || "").trim();
			if (!code) return null;

			this._itemAutofillCache = this._itemAutofillCache || {};
			if (this._itemAutofillCache[code]) return this._itemAutofillCache[code];

			const sourceDoc = this._currentOpportunityDoc || {};
			const sellingPriceList = sourceDoc.selling_price_list || "Standard Selling";
			const buyingPriceList = sourceDoc.buying_price_list || "Standard Buying";

			const itemRes = await frappe.db.get_value("Item", code, [
				"item_name",
				"description",
				"item_group",
				"brand",
				"gst_hsn_code",
				"stock_uom",
				"standard_rate",
				"valuation_rate",
			]).catch(() => ({ message: {} }));

			const itemInfo = itemRes?.message || {};
			const rawDescription = String(itemInfo.description || "");
			const normalizedDescription = (
				frappe.utils.strip_html
					? frappe.utils.strip_html(rawDescription)
					: $("<div>").html(rawDescription).text()
			);
			let rate = Number(itemInfo.standard_rate || 0);
			let buyingRate = Number(itemInfo.valuation_rate || 0);

			const sellingPriceRows = await frappe.db.get_list("Item Price", {
				fields: ["price_list_rate"],
				filters: {
					item_code: code,
					selling: 1,
					price_list: sellingPriceList,
				},
				limit: 1,
				order_by: "valid_from desc",
			}).catch(() => []);

			if (sellingPriceRows?.length) {
				rate = Number(sellingPriceRows[0].price_list_rate || rate || 0);
			}

			const buyingPriceRows = await frappe.db.get_list("Item Price", {
				fields: ["price_list_rate"],
				filters: {
					item_code: code,
					buying: 1,
					price_list: buyingPriceList,
				},
				limit: 1,
				order_by: "valid_from desc",
			}).catch(() => []);

			if (buyingPriceRows?.length) {
				buyingRate = Number(buyingPriceRows[0].price_list_rate || buyingRate || 0);
			}

			const out = {
				item_code: code,
				item_name: itemInfo.item_name || code,
				description: String(normalizedDescription || "").replace(/\u00a0/g, " ").trim(),
				description_html: rawDescription,
				item_group: itemInfo.item_group || "",
				brand: itemInfo.brand || "Others",
				hsncode: itemInfo.gst_hsn_code || "",
				uom: itemInfo.stock_uom || "",
				rate,
				buying_rate: buyingRate,
			};

			this._itemAutofillCache[code] = out;
			return out;
		}

		async extractRenewalItemPreset(renewalDoc, renewalId, opportunityType = "Renewal", selectedItemRowName = "") {
			const doc = renewalDoc || {};
			const itemTables = [doc.items, doc.renewal_items, doc.products, doc.product_items].filter(Array.isArray);
			const allRows = itemTables.flat();
			const itemRow = allRows.find((row) => String(row?.name || "").trim() === String(selectedItemRowName || "").trim())
				|| allRows.find((row) => String(row?.item_code || row?.item || "").trim())
				|| {};

			const itemCode = String(
				itemRow.item_code
				|| itemRow.item
				|| doc.item_code
				|| doc.item
				|| ""
			).trim();

			if (!itemCode) return null;

			const qty = Number(itemRow.qty || itemRow.quantity || doc.qty || 1) || 1;
			let rate = Number(itemRow.rate || doc.rate || 0) || 0;
			if (!rate) {
				const amountForRate = Number(itemRow.amount || doc.amount || 0) || 0;
				rate = qty > 0 ? (amountForRate / qty) : 0;
			}

			const itemMeta = await this.getItemAutofill(itemCode);
			if (!rate) rate = Number(itemMeta?.rate || 0) || 0;

			const pickFirstPositive = (...values) => {
				for (const value of values) {
					const parsed = Number(value);
					if (Number.isFinite(parsed) && parsed > 0) return parsed;
				}
				return 0;
			};
			const amount = Number(itemRow.amount || doc.amount || (qty * rate)) || (qty * rate);

			return {
				item_code: itemCode,
				item_name: String(itemRow.item_name || itemMeta?.item_name || itemCode).trim(),
				brand: String(itemRow.brand || itemMeta?.brand || "").trim(),
				item_group: String(itemRow.item_group || itemMeta?.item_group || "").trim(),
				description: String(itemRow.description || itemMeta?.description_html || itemMeta?.description || "").trim(),
				uom: String(itemRow.uom || itemMeta?.uom || "").trim(),
				hsncode: String(itemRow.hsncode || itemRow.hsn_code || itemMeta?.hsncode || "").trim(),
				qty,
				rate,
				amount,
				renewal_id: String(renewalId || "").trim(),
				opportunity_type: String(opportunityType || "").trim(),
			};
		}

		async pickRenewalPresetItem(opportunityType = "Renewal", customerName = "") {
			const renewalDoctype = (await this.getOpportunityRenewalDoctype()) || "Renewal List";
			const customerFilterField = await this.getOpportunityRenewalCustomerFilterField();

			if (renewalDoctype !== "Renewal List") {
				return await new Promise((resolve) => {
					let settled = false;
					const finish = (value) => {
						if (settled) return;
						settled = true;
						resolve(value || null);
					};

					const dialog = new frappe.ui.Dialog({
						title: __("Select Renewal"),
						fields: [
							{
								label: "Renewal",
								fieldname: "renewal_id",
								fieldtype: "Link",
								options: renewalDoctype,
								reqd: 1,
								get_query: () => {
									if (!customerName || !customerFilterField) return {};
									return {
										filters: {
											[customerFilterField]: customerName,
										},
									};
								},
							},
						],
						primary_action_label: __("Use Renewal"),
						primary_action: async (values) => {
							const renewalId = String(values?.renewal_id || "").trim();
							if (!renewalId) return;

							try {
								const renewalDoc = await frappe.db.get_doc(renewalDoctype, renewalId);
								const preset = await this.extractRenewalItemPreset(renewalDoc, renewalId, opportunityType);
								if (!preset?.item_code) {
									frappe.msgprint(__("No valid item found in selected renewal."));
									return;
								}
								dialog.hide();
								finish(preset);
							} catch (e) {
								frappe.msgprint(__("Unable to fetch selected renewal."));
							}
						},
					});

					dialog.$wrapper.on("hidden.bs.modal", () => finish(null));
					dialog.show();
				});
			}

			return await new Promise((resolve) => {
				let settled = false;
				let selectedRow = null;
				let currentRows = [];
				let searchTimer = null;
				const finish = (value) => {
					if (settled) return;
					settled = true;
					resolve(value || null);
				};

				if (!document.getElementById("renewal-preset-picker-style")) {
					const styleEl = document.createElement("style");
					styleEl.id = "renewal-preset-picker-style";
					styleEl.textContent = `
					.renewal-preset-picker-dialog .modal-dialog {
						width: min(90vw, 1400px) !important;
						max-width: min(90vw, 1400px) !important;
					}
					.renewal-preset-picker-filters {
						display: grid;
						grid-template-columns: repeat(4, minmax(0, 1fr));
						gap: 12px;
						margin-bottom: 16px;
					}
					.renewal-preset-picker-results {
						border: 1px solid #dbe2ea;
						border-radius: 10px;
						overflow: hidden;
					}
					.renewal-preset-picker-table-wrap {
						max-height: 55vh;
						overflow: auto;
					}
					.renewal-preset-picker-table {
						width: 100%;
						border-collapse: collapse;
					}
					.renewal-preset-picker-table th,
					.renewal-preset-picker-table td {
						padding: 10px 12px;
						border-bottom: 1px solid #edf2f7;
						vertical-align: top;
					}
					.renewal-preset-picker-table tbody tr {
						cursor: pointer;
					}
					.renewal-preset-picker-table tbody tr.is-selected {
						background: #eef4ff;
					}
					.renewal-preset-picker-meta {
						font-size: 12px;
						color: #64748b;
						margin-top: 4px;
					}
					.renewal-preset-picker-empty {
						padding: 28px 16px;
						text-align: center;
						color: #64748b;
					}
					@media (max-width: 900px) {
						.renewal-preset-picker-filters {
							grid-template-columns: repeat(2, minmax(0, 1fr));
						}
					}
				`;
					document.head.appendChild(styleEl);
				}

				const dialog = new frappe.ui.Dialog({
					title: __(opportunityType === "Additional" ? "Select Active Renewal for Additional Item" : "Select Active Renewal"),
					size: "extra-large",
					fields: [
						{
							fieldtype: "HTML",
							fieldname: "renewal_picker_html",
						},
					],
					primary_action_label: __("Use Renewal"),
					primary_action: async () => {
						if (!selectedRow?.renewal_id) {
							frappe.msgprint(__("Please select an active renewal."));
							return;
						}

						try {
							const renewalDoc = await frappe.db.get_doc(renewalDoctype, selectedRow.renewal_id);
							const preset = await this.extractRenewalItemPreset(
								renewalDoc,
								selectedRow.renewal_id,
								opportunityType,
								selectedRow.item_row
							);
							if (!preset?.item_code) {
								frappe.msgprint(__("No valid item found in selected renewal."));
								return;
							}
							dialog.hide();
							finish(preset);
						} catch (e) {
							frappe.msgprint(__("Unable to fetch selected renewal."));
						}
					},
				});

				dialog.show();
				dialog.$wrapper.addClass("renewal-preset-picker-dialog");
				dialog.$wrapper
					.off("click.renewalPickerClose", ".btn-modal-close, .close")
					.on("click.renewalPickerClose", ".btn-modal-close, .close", function (e) {
						e.preventDefault();
						e.stopImmediatePropagation();
						dialog.hide();
					});
				dialog.$wrapper.on("hidden.bs.modal", () => finish(null));

				const $host = dialog.get_field("renewal_picker_html").$wrapper;
				$host.html(`
				<div class="renewal-preset-picker">
					<div class="renewal-preset-picker-filters">
						<div>
							<label class="small text-muted d-block mb-1">Brand</label>
							<input type="text" class="form-control form-control-sm" data-renewal-filter="brand" placeholder="Search brand">
						</div>
						<div>
							<label class="small text-muted d-block mb-1">Product</label>
							<input type="text" class="form-control form-control-sm" data-renewal-filter="product" placeholder="Search product">
						</div>
						<div>
							<label class="small text-muted d-block mb-1">End Date</label>
							<input type="date" class="form-control form-control-sm" data-renewal-filter="end_date">
						</div>
						<div>
							<label class="small text-muted d-block mb-1">Renewal ID</label>
							<input type="text" class="form-control form-control-sm" data-renewal-filter="renewal_id" placeholder="Search renewal id">
						</div>
					</div>
					<div class="renewal-preset-picker-results">
						<div class="renewal-preset-picker-table-wrap">
							<table class="renewal-preset-picker-table">
								<thead>
									<tr>
										<th>Product</th>
										<th>Brand</th>
										<th>End Date</th>
										<th>Renewal ID</th>
									</tr>
								</thead>
								<tbody></tbody>
							</table>
						</div>
					</div>
				</div>
			`);

				const $picker = $host.find(".renewal-preset-picker");
				const $tbody = $picker.find("tbody");
				const updatePrimaryState = () => {
					dialog.get_primary_btn()?.prop("disabled", !selectedRow?.renewal_id);
				};

				const renderRows = (rows) => {
					currentRows = Array.isArray(rows) ? rows : [];
					if (!currentRows.length) {
						selectedRow = null;
						$tbody.html(`<tr><td colspan="4" class="renewal-preset-picker-empty">No active renewals found for the selected filters.</td></tr>`);
						updatePrimaryState();
						return;
					}

					$tbody.html(
						currentRows.map((row, idx) => {
							const productLabel = frappe.utils.escape_html(String(row.product_name || row.item_name || row.item_code || "-").trim() || "-");
							const itemMeta = [String(row.item_name || "").trim(), String(row.item_code || "").trim()].filter(Boolean).join(" | ");
							const brandLabel = frappe.utils.escape_html(String(row.brand || "-").trim() || "-");
							const endDate = row.end_date ? frappe.datetime.str_to_user(String(row.end_date).trim()) : "-";
							const renewalId = frappe.utils.escape_html(String(row.renewal_id || "-").trim() || "-");
							const isSelected = selectedRow?.renewal_id === row.renewal_id && selectedRow?.item_row === row.item_row;
							return `
							<tr data-row-index="${idx}" class="${isSelected ? "is-selected" : ""}">
								<td>
									<div>${productLabel}</div>
									<div class="renewal-preset-picker-meta">${frappe.utils.escape_html(itemMeta || "")}</div>
								</td>
								<td>${brandLabel}</td>
								<td>${frappe.utils.escape_html(endDate)}</td>
								<td>${renewalId}</td>
							</tr>
						`;
						}).join("")
					);
					updatePrimaryState();
				};

				const loadRows = async () => {
					const filters = {};
					$picker.find("[data-renewal-filter]").each(function () {
						const key = String($(this).data("renewalFilter") || "").trim();
						if (!key) return;
						filters[key] = String($(this).val() || "").trim();
					});

					try {
						const response = await frappe.call({
							method: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.search_active_renewal_presets",
							args: {
								customer_name: customerName,
								filters,
								start: 0,
								page_len: 30,
							},
						});
						selectedRow = null;
						renderRows(response?.message || []);
					} catch (e) {
						selectedRow = null;
						renderRows([]);
						frappe.show_alert({ message: __("Unable to load active renewals."), indicator: "orange" }, 5);
					}
				};

				$picker.on("input change", "[data-renewal-filter]", function () {
					clearTimeout(searchTimer);
					searchTimer = setTimeout(() => {
						loadRows();
					}, $(this).is("input[type='date']") ? 0 : 250);
				});

				$picker.on("click", "tbody tr[data-row-index]", function () {
					const idx = Number($(this).data("rowIndex"));
					selectedRow = currentRows[idx] || null;
					renderRows(currentRows);
				});

				$picker.on("dblclick", "tbody tr[data-row-index]", async function () {
					const idx = Number($(this).data("rowIndex"));
					selectedRow = currentRows[idx] || null;
					renderRows(currentRows);
					await dialog.primary_action();
				});

				updatePrimaryState();
				loadRows();
			});
		}

		async renderOpportunityContactSection(doc) {
			const contactFieldValue = doc.contact_person || "";
			const $container = $("#detail-contact-person");
			if (!$container.length) return;

			this._currentOpportunityName = doc.name;
			this._currentPartyName = doc[OPP_CFG.PARTY_NAME_FIELD] || doc.customer || doc.lead || "";

			const getContactIdFromRow = (row = {}) => {
				const candidates = [
					row.contact,
					row.contact_person,
					row.contact_name,
					row.party_contact,
					row.user_name,
					row.name1,
				];
				return String(candidates.find((value) => String(value || "").trim()) || "").trim();
			};

			const tableRows = Array.isArray(doc.contact_list)
				? doc.contact_list
				: (Array.isArray(doc.contacts) ? doc.contacts : []);

			const rowContacts = tableRows
				.map((row) => {
					const contactId = getContactIdFromRow(row);
					if (!contactId) return null;
					return {
						contact_id: contactId,
						row_name: String(row.name || "").trim(),
						full_name: String(row.full_name || row.person_name || row.contact_name || "").trim(),
						email: String(row.email_id || row.contact_email || row.email || "").trim(),
						mobile: String(row.mobile_no || row.contact_mobile || row.phone || row.phone_no || "").trim(),
						designation: String(row.designation || row.desgination || "").trim(),
						is_primary: Number(
							row.is_primary_contact
							|| row.is_primary
							|| row.tpoc
							|| row.is_tpoc
							|| 0
						) === 1,
					};
				})
				.filter(Boolean);

			if (contactFieldValue && !rowContacts.some((entry) => entry.contact_id === String(contactFieldValue).trim())) {
				rowContacts.unshift({
					contact_id: String(contactFieldValue).trim(),
					row_name: "",
					full_name: "",
					email: "",
					mobile: "",
					designation: "",
					is_primary: true,
				});
			}

			const uniqueContacts = [];
			const seenContacts = new Set();
			rowContacts.forEach((entry) => {
				const key = String(entry.contact_id || "").trim();
				if (!key || seenContacts.has(key)) return;
				seenContacts.add(key);
				uniqueContacts.push(entry);
			});

			if (String(contactFieldValue || "").trim()) {
				uniqueContacts.forEach((entry) => {
					entry.is_primary = String(entry.contact_id || "").trim() === String(contactFieldValue || "").trim();
				});
			} else if (uniqueContacts.some((entry) => entry.is_primary)) {
				let seenPrimary = false;
				uniqueContacts.forEach((entry) => {
					if (entry.is_primary && !seenPrimary) {
						seenPrimary = true;
						entry.is_primary = true;
					} else {
						entry.is_primary = false;
					}
				});
			}

			const contactEntries = await Promise.all(uniqueContacts.map(async (entry) => {
				const contactId = String(entry.contact_id || "").trim();
				if (!contactId) return null;

				let contactDoc = null;
				try {
					contactDoc = await frappe.db.get_doc("Contact", contactId);
				} catch (e) {
					contactDoc = null;
				}

				const displayName = String(
					contactDoc?.full_name
					|| [contactDoc?.first_name, contactDoc?.last_name].filter(Boolean).join(" ")
					|| entry.full_name
					|| contactId
				).trim();

				return {
					contact_id: contactId,
					row_name: entry.row_name,
					name: displayName,
					email: String(contactDoc?.email_id || contactDoc?.email_ids?.[0]?.email_id || entry.email || "").trim(),
					mobile: String(contactDoc?.mobile_no || contactDoc?.phone || contactDoc?.phone_nos?.[0]?.phone || entry.mobile || doc.mobile_no || "").trim(),
					designation: String(contactDoc?.designation || entry.designation || "").trim(),
					is_primary: Boolean(entry.is_primary),
				};
			}));

			const validContacts = contactEntries.filter(Boolean);
			this._currentContactSummary = validContacts;
			this._currentContactSummaryById = validContacts.reduce((acc, entry) => {
				acc[entry.contact_id] = entry;
				return acc;
			}, {});
			this._currentContactId = contactFieldValue || (validContacts[0]?.contact_id || "");

			if (!validContacts.length) {
				$container.html(`<span class="text-muted">-</span>`);
				this.bindOpportunityContactActions();
				return;
			}

			const html = validContacts
				.map((entry) => {
					const safeId = frappe.utils.escape_html(entry.contact_id || "");
					const safeName = frappe.utils.escape_html(entry.name || "-");
					const primaryIndicator = `<i class="fa fa-check-circle new-opp-contact-tpoc ${entry.is_primary ? "is-active" : "is-inactive"}" title="Primary Contact"></i>`;
					return `
        <div class="contact-entry gap-1 d-flex align-items-center" data-contact-id="${safeId}" style="width:100%; margin-bottom:1px;">
          ${primaryIndicator}
          <span class="opp-contact-name text-truncate" style="cursor:pointer;" title="${safeName}">
            ${safeName}
          </span>
          <i class="fa fa-trash-can text-danger delete-contact" style="cursor:pointer; font-size:13px; margin-left:3px;" title="Remove Contact"></i>
        </div>
      `;
				})
				.join("");

			$container.html(html);

			this.bindOpportunityContactActions();
		}

		async renderOpportunitySalesTeamSection(doc) {
			const $container = $("#detail-sales-team");
			if (!$container.length) return;

			const rows = Array.isArray(doc.sales_team) ? doc.sales_team : [];
			const teamRows = rows
				.map((row) => ({
					sales_person: row.sales_person || row.employee || row.owner || "",
					employee: row.employee || "",
					allocated_percentage: Number(row.allocated_percentage || 0),
					contribution_to_net_total: Number(row.contribution_to_net_total || 0),
				}))
				.filter((row) => row.sales_person);

			this._currentSalesTeamSummary = teamRows;

			if (!teamRows.length) {
				$container.html(`<span class="text-muted">-</span>`);
				return;
			}

			const html = teamRows
				.map((row, idx) => {
					const label = frappe.utils.escape_html(row.sales_person);
					return `
        <div class="contact-entry gap-1 d-flex align-items-center" style="width:100%; margin-bottom:1px;">
          <span class="opp-sales-team-name text-truncate" style="cursor:pointer;" data-idx="${idx}" title="${label}">
            ${label}
          </span>
        </div>
      `;
				})
				.join("");

			$container.html(html);
			this.bindOpportunitySalesTeamActions();
		}

		async renderOpportunityAddressSection(doc) {
			const addressMap = {
				customer: String(doc.customer_address || doc.customer_address_name || doc.billing_address_name || doc.billing_address || "").trim(),
				shipping: String(doc.shipping_address_name || doc.shipping_address || "").trim(),
				company: String(doc.company_address || "").trim(),
			};

			const $customer = $("#detail-customer-address-name");
			const $shipping = $("#detail-shipping-address-name");
			const $company = $("#detail-company-address-name");

			if ($customer.length) {
				$customer.text(addressMap.customer || "-").attr("title", addressMap.customer || "-").data("addressName", addressMap.customer);
			}
			if ($shipping.length) {
				$shipping.text(addressMap.shipping || "-").attr("title", addressMap.shipping || "-").data("addressName", addressMap.shipping);
			}
			if ($company.length) {
				$company.text(addressMap.company || "-").attr("title", addressMap.company || "-").data("addressName", addressMap.company);
			}

			const me = this;
			$("#detail-customer-address-name, #detail-shipping-address-name, #detail-company-address-name")
				.off("click")
				.on("click", async function () {
					const addressName = String($(this).data("addressName") || "").trim();
					if (!addressName) return;

					let addressDoc = null;
					try {
						addressDoc = await frappe.db.get_doc("Address", addressName);
					} catch (e) {
						addressDoc = null;
					}

					const lines = [
						String(addressDoc?.address_line1 || "").trim(),
						String(addressDoc?.address_line2 || "").trim(),
						[String(addressDoc?.city || "").trim(), String(addressDoc?.state || "").trim()].filter(Boolean).join(", "),
						String(addressDoc?.pincode || "").trim(),
						String(addressDoc?.country || "").trim(),
					].filter(Boolean).join(", ");
					const gstin = String(addressDoc?.gstin || addressDoc?.gstin_no || addressDoc?.tax_id || "").trim();

					me.showRightPanelPersonCard({
						title: addressName,
						role: "Address",
						showEmail: false,
						showMobile: false,
						metaLabel: "Address Details",
						metaValue: lines || "-",
						secondaryMetaLabel: gstin ? "GSTIN" : "",
						secondaryMetaValue: gstin || "",
					});
				});
		}

		renderQuotationTaxesSection(doc) {
			const $tbody = $("#detail-taxes-tbody");
			const $total = $("#detail-taxes-total");
			const $taxCategory = $("#detail-tax-category");
			const $taxTemplate = $("#detail-taxes-template");
			const $toggleBtn = $("#detail-taxes-toggle-btn");
			const $tableWrap = $("#detail-taxes-table-wrap");
			if (!$tbody.length || !$total.length) return;

			const taxCategory = String(doc.tax_category || "").trim();
			const taxesTemplate = String(doc.taxes_and_charges || "").trim();
			if ($taxCategory.length) {
				$taxCategory.text(taxCategory || "-").attr("title", taxCategory || "-");
			}
			if ($taxTemplate.length) {
				$taxTemplate.text(taxesTemplate || "-").attr("title", taxesTemplate || "-");
			}

			const rows = Array.isArray(doc.taxes) ? doc.taxes : [];
			if (!rows.length) {
				$tbody.html('<tr><td colspan="6" class="muted">No taxes</td></tr>');
				$total.text(fmtCurrency(0));
				if ($tableWrap.length) $tableWrap.addClass("d-none");
				if ($toggleBtn.length) {
					$toggleBtn.text("Show Table").prop("disabled", true);
					$toggleBtn.off("click.detailTaxesToggle");
				}
				return;
			}

			let running = 0;
			let total = 0;
			const bodyHtml = rows.map((row, idx) => {
				const chargeType = String(row.charge_type || row.type || "On Net Total").trim();
				const accountHead = String(row.account_head || row.account || "-").trim();
				const rate = Number(row.rate || row.tax_rate || 0) || 0;
				const amount = Number(row.tax_amount || row.amount || 0) || 0;
				running += amount;
				total += amount;

				return `
				<tr>
					<td class="line-items-center">${idx + 1}</td>
					<td><span class="cell-ellipsis" title="${frappe.utils.escape_html(chargeType)}">${frappe.utils.escape_html(chargeType)}</span></td>
					<td><span class="cell-ellipsis" title="${frappe.utils.escape_html(accountHead)}">${frappe.utils.escape_html(accountHead)}</span></td>
					<td class="line-items-center">${frappe.utils.escape_html(String(rate))}</td>
					<td class="line-items-center">${frappe.utils.escape_html(fmtCurrency(amount))}</td>
					<td class="line-items-center">${frappe.utils.escape_html(fmtCurrency(running))}</td>
				</tr>
			`;
			}).join("");

			$tbody.html(bodyHtml);
			$total.text(fmtCurrency(total));

			if ($tableWrap.length) {
				$tableWrap.addClass("d-none");
			}

			if ($toggleBtn.length && $tableWrap.length) {
				const updateToggleLabel = () => {
					const isOpen = !$tableWrap.hasClass("d-none");
					$toggleBtn.text(isOpen ? "Hide Table" : "Show Table");
				};

				$toggleBtn.prop("disabled", false);
				updateToggleLabel();
				$toggleBtn
					.off("click.detailTaxesToggle")
					.on("click.detailTaxesToggle", (e) => {
						e.preventDefault();
						$tableWrap.toggleClass("d-none");
						updateToggleLabel();
					});
			}
		}

		renderQuotationPaymentTermsSection(doc) {
			const $tbody = $("#detail-payment-terms-tbody");
			const $total = $("#detail-payment-terms-total");
			const $template = $("#detail-payment-terms-template");
			if (!$tbody.length || !$total.length) return;

			if ($template.length) {
				const templateName = String(doc.payment_terms_template || "").trim();
				$template.text(templateName || "-").attr("title", templateName || "-");
			}

			const rows = Array.isArray(doc.payment_schedule) ? doc.payment_schedule : [];
			if (!rows.length) {
				$tbody.html('<tr><td colspan="6" class="muted">No payment terms</td></tr>');
				$total.text(fmtCurrency(0));
				return;
			}

			let total = 0;
			const bodyHtml = rows.map((row, idx) => {
				const term = String(row.payment_term || row.payment_term_name || "-").trim();
				const description = String(row.description || row.invoice_portion_description || "-").trim();
				const invoicePortion = Number(row.invoice_portion || 0) || 0;
				const dueDate = row.due_date ? frappe.datetime.str_to_user(String(row.due_date).trim()) : "-";
				const paymentAmount = Number(row.payment_amount || row.amount || 0) || 0;
				total += paymentAmount;

				return `
				<tr>
					<td class="line-items-center">${idx + 1}</td>
					<td><span class="cell-ellipsis" title="${frappe.utils.escape_html(term)}">${frappe.utils.escape_html(term)}</span></td>
					<td><span class="cell-ellipsis" title="${frappe.utils.escape_html(description)}">${frappe.utils.escape_html(description)}</span></td>
					<td class="line-items-center">${frappe.utils.escape_html(dueDate)}</td>
					<td class="line-items-center">${frappe.utils.escape_html(String(invoicePortion))}</td>
					<td class="line-items-center">${frappe.utils.escape_html(fmtCurrency(paymentAmount))}</td>
				</tr>
			`;
			}).join("");

			$tbody.html(bodyHtml);
			$total.text(fmtCurrency(total));
		}

		renderQuotationTermsSection(doc) {
			const $terms = $("#detail-terms-and-conditions");
			const $tcName = $("#detail-terms-template-name");
			if (!$terms.length) return;

			if ($tcName.length) {
				const tcName = String(doc.tc_name || doc.terms_template || "").trim();
				$tcName.text(tcName || "-").attr("title", tcName || "-");
			}

			const rawHtml = String(doc.terms || doc.terms_and_conditions || doc.description || doc.remarks || "").trim();
			const normalized = this.normalizeRichTextContent(rawHtml);
			if (!normalized) {
				$terms.html("<span class='muted'>No terms and conditions</span>");
				return;
			}

			$terms.html(normalized);
		}

		renderOrderSummary(doc) {
			const $totalQty = $("#detail-order-total-quantity");
			const $total = $("#detail-order-total");
			const $totalTax = $("#detail-order-total-tax");
			const $grandTotal = $("#detail-order-grand-total");

			if (!$totalQty.length || !$total.length || !$totalTax.length || !$grandTotal.length) return;

			// Calculate total quantity from items
			const items = Array.isArray(doc.items) ? doc.items : [];
			let totalQty = 0;
			let totalAmount = 0;

			items.forEach((item) => {
				const qty = Number(item.qty || 0) || 0;
				const amount = Number(item.amount || 0) || 0;
				totalQty += qty;
				totalAmount += amount;
			});

			// Calculate total tax from taxes table
			const taxes = Array.isArray(doc.taxes) ? doc.taxes : [];
			let totalTaxAmount = 0;

			taxes.forEach((tax) => {
				const taxAmount = Number(tax.tax_amount || tax.amount || 0) || 0;
				totalTaxAmount += taxAmount;
			});

			// Calculate grand total
			const grandTotalAmount = totalAmount + totalTaxAmount;

			// Update the display
			$totalQty.text(fmtInt(totalQty));
			$total.text(fmtCurrency(totalAmount));
			$totalTax.text(fmtCurrency(totalTaxAmount));
			$grandTotal.text(fmtCurrency(grandTotalAmount));
		}

		bindOpportunityContactActions() {
			const me = this;

			$("#add-contact-btn")
				.off("click")
				.on("click", function () {
					const dialog = new frappe.ui.Dialog({
						title: __("Add Contact Person"),
						fields: [
							{
								label: __("Contact"),
								fieldname: "contact",
								fieldtype: "Link",
								options: "Contact",
								reqd: 1,
								get_query: () => {
									const doc = me._currentOpportunityDoc || {};
									const opportunityFrom = String(doc.opportunity_from || "").toLowerCase();
									const customerName = doc.customer
										|| (opportunityFrom === "customer" ? (doc.customer || doc[OPP_CFG.PARTY_NAME_FIELD] || "") : "");

									if (!customerName) {
										frappe.show_alert({
											message: __("No customer found on this opportunity."),
											indicator: "orange",
										});
										return {
											filters: {
												name: ["=", ""],
											},
										};
									}

									return {
										query: "frappe.contacts.doctype.contact.contact.contact_query",
										filters: {
											link_doctype: "Customer",
											link_name: customerName,
										},
									};
								},
							},
						],
						primary_action_label: __("Add"),
						primary_action: (values) => {
							if (!values?.contact || !me._currentOpportunityName) return;
							frappe.call({
								method: "frappe.client.set_value",
								args: {
									doctype: OPP_CFG.DOCTYPE,
									name: me._currentOpportunityName,
									fieldname: "contact_person",
									value: values.contact,
								},
								callback: () => {
									dialog.hide();
									frappe.show_alert({ message: __("Contact added"), indicator: "green" });
									me.load_doc_details(me._currentOpportunityName);
								},
							});
						},
					});
					dialog.show();
				});

			$("#detail-contact-person")
				.off("click", ".delete-contact")
				.on("click", ".delete-contact", async function (e) {
					e.preventDefault();
					e.stopPropagation();
					if (!me._currentOpportunityName) return;

					const contactId = String($(this).closest(".contact-entry").data("contact-id") || "").trim();
					if (!contactId) return;

					const latestDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, me._currentOpportunityName).catch(() => null);
					if (!latestDoc) return;

					const tableFieldname = Array.isArray(latestDoc.contact_list)
						? "contact_list"
						: (Array.isArray(latestDoc.contacts) ? "contacts" : "");

					const getContactIdFromRow = (row = {}) => {
						const candidates = [
							row.contact,
							row.contact_person,
							row.contact_name,
							row.party_contact,
							row.user_name,
							row.name1,
						];
						return String(candidates.find((value) => String(value || "").trim()) || "").trim();
					};

					if (tableFieldname) {
						const existingRows = Array.isArray(latestDoc[tableFieldname]) ? latestDoc[tableFieldname] : [];
						latestDoc[tableFieldname] = existingRows.filter((row) => getContactIdFromRow(row) !== contactId);

						if (String(latestDoc.contact_person || "").trim() === contactId) {
							const remaining = latestDoc[tableFieldname]
								.map((row) => getContactIdFromRow(row))
								.filter(Boolean);
							latestDoc.contact_person = remaining[0] || "";
						}

						frappe.call({
							method: "frappe.client.save",
							args: { doc: me.prepareDocForSave(latestDoc) },
							callback: () => {
								frappe.show_alert({ message: __("Contact removed"), indicator: "orange" });
								me.load_doc_details(me._currentOpportunityName);
							},
						});
						return;
					}

					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype: OPP_CFG.DOCTYPE,
							name: me._currentOpportunityName,
							fieldname: "contact_person",
							value: String(latestDoc.contact_person || "").trim() === contactId ? "" : latestDoc.contact_person,
						},
						callback: () => {
							frappe.show_alert({ message: __("Contact removed"), indicator: "orange" });
							me.load_doc_details(me._currentOpportunityName);
						},
					});
				});

			$("#detail-contact-person")
				.off("click", ".opp-contact-name")
				.on("click", ".opp-contact-name", function () {
					const contactId = String($(this).closest(".contact-entry").data("contact-id") || "").trim();
					const c = me._currentContactSummaryById?.[contactId] || (Array.isArray(me._currentContactSummary) ? me._currentContactSummary[0] : null) || {};
					if (!c.name) return;
					me.showRightPanelPersonCard({
						title: c.name,
						role: "Contact Person",
						email: c.email || "",
						mobile: c.mobile || "",
						metaLabel: c.designation ? "Designation" : "",
						metaValue: c.designation || "",
					});
				});
		}

		bindOpportunitySalesTeamActions() {
			const me = this;

			$("#detail-sales-team")
				.off("click", ".opp-sales-team-name")
				.on("click", ".opp-sales-team-name", async function () {
					const idx = Number($(this).data("idx"));
					const row = (me._currentSalesTeamSummary || [])[idx] || {};
					if (!row.sales_person) return;

					const details = await me.getSalesPersonDetails(row);
					me.showRightPanelPersonCard({
						title: details.name || row.sales_person,
						role: "Sales Person",
						email: details.email || "",
						mobile: details.mobile || "",
						metaLabel: details.designation ? "Designation" : "Allocation / Contribution",
						metaValue: details.designation || `${details.allocated_percentage || 0}% / ${details.contribution_to_net_total || 0}`,
					});
				});
		}

		getRightPanelPersonCardHost() {
			const $panel = $(".detail-panel").first();
			if (!$panel.length) return null;

			let $card = $panel.find("#right-panel-person-card");
			if (!$card.length) {
				$panel.append(`
      <div id="right-panel-person-card" class="panel-person-card d-none"></div>
    `);
				$card = $panel.find("#right-panel-person-card");
			}
			return { $panel, $card };
		}

		hideRightPanelPersonCard() {
			const host = this.getRightPanelPersonCardHost();
			if (!host) return;
			const { $panel, $card } = host;
			$card.addClass("d-none").empty();

			const prev = this._rightPanelPrevState;

			if (!prev) {
				$panel.find(".panel__tabs").removeClass("d-none");
				$panel.find(".panel__header").removeClass("d-none");
				$panel.find("#panel-cards-section").removeClass("d-none");
				$panel.find("#panel-form-section").addClass("d-none");
				this._rightPanelPrevState = null;
				return;
			}

			if (prev.tabsHidden) {
				$panel.find(".panel__tabs").addClass("d-none");
			} else {
				$panel.find(".panel__tabs").removeClass("d-none");
			}

			if (prev.headerHidden) {
				$panel.find(".panel__header").addClass("d-none");
			} else {
				$panel.find(".panel__header").removeClass("d-none");
			}

			if (prev.cardsHidden) {
				$panel.find("#panel-cards-section").addClass("d-none");
			} else {
				$panel.find("#panel-cards-section").removeClass("d-none");
			}

			if (prev.formHidden) {
				$panel.find("#panel-form-section").addClass("d-none");
			} else {
				$panel.find("#panel-form-section").removeClass("d-none");
			}

			this._rightPanelPrevState = null;
		}

		showRightPanelPersonCard(details = {}) {
			const host = this.getRightPanelPersonCardHost();
			if (!host) return;

			const { $panel, $card } = host;
			const esc = (value) => frappe.utils.escape_html(String(value || ""));
			const title = esc(details.title || "Details");
			const role = esc(details.role || "");
			const showEmail = details.showEmail !== false;
			const showMobile = details.showMobile !== false;
			const email = esc(details.email || "-");
			const mobile = esc(details.mobile || "-");
			const metaLabel = esc(details.metaLabel || "");
			const metaValue = esc(details.metaValue || "");
			const secondaryMetaLabel = esc(details.secondaryMetaLabel || "");
			const secondaryMetaValue = esc(details.secondaryMetaValue || "");

			const isPersonCardAlreadyOpen = !$card.hasClass("d-none");
			if (!isPersonCardAlreadyOpen || !this._rightPanelPrevState) {
				this._rightPanelPrevState = {
					tabsHidden: $panel.find(".panel__tabs").hasClass("d-none"),
					headerHidden: $panel.find(".panel__header").hasClass("d-none"),
					cardsHidden: $panel.find("#panel-cards-section").hasClass("d-none"),
					formHidden: $panel.find("#panel-form-section").hasClass("d-none"),
				};
			}

			$card.html(`
    <div class="panel-person-head">
      <div class="panel-person-head-left">
        <div class="panel-person-title-wrap">
          <div class="panel-person-name" title="${title}"><i class="fa fa-user text-primary"></i>&nbsp; ${title}</div>
          ${role ? `<div class="small muted">${role}</div>` : ""}
        </div>
      </div>
      <button type="button" class="panel-person-close" aria-label="Close">&times;</button>
    </div>
		${showEmail ? `
			<div class="panel-person-item">
				<div class="panel-person-item-icon"><i class="fa fa-comment"></i></div>
				<div class="panel-person-item-body">
					<div class="panel-person-item-label">Email</div>
					<div class="panel-person-value" title="${email}">${email}</div>
				</div>
			</div>
		` : ""}
		${showMobile ? `
			<div class="panel-person-item">
				<div class="panel-person-item-icon"><i class="fa fa-mobile"></i></div>
				<div class="panel-person-item-body">
					<div class="panel-person-item-label">Mobile No</div>
					<div class="panel-person-value" title="${mobile}">${mobile}</div>
				</div>
			</div>
		` : ""}
    ${metaLabel ? `
      <div class="panel-person-item">
        <div class="panel-person-item-icon"><i class="fa fa-info-circle"></i></div>
        <div class="panel-person-item-body">
          <div class="panel-person-item-label">${metaLabel}</div>
          <div class="panel-person-value" title="${metaValue}">${metaValue || "-"}</div>
        </div>
      </div>
    ` : ""}
		${secondaryMetaLabel ? `
			<div class="panel-person-item">
				<div class="panel-person-item-icon"><i class="fa fa-info-circle"></i></div>
				<div class="panel-person-item-body">
					<div class="panel-person-item-label">${secondaryMetaLabel}</div>
					<div class="panel-person-value" title="${secondaryMetaValue}">${secondaryMetaValue || "-"}</div>
				</div>
			</div>
		` : ""}
  `);

			$panel.find(".panel__tabs, .panel__header, #panel-cards-section, #panel-form-section").addClass("d-none");
			$card.removeClass("d-none");

			$card.off("click", ".panel-person-close").on("click", ".panel-person-close", () => {
				this.hideRightPanelPersonCard();
			});
		}

		async getSalesPersonDetails(row = {}) {
			const key = `${row.sales_person || ""}::${row.employee || ""}`;
			this._salesPersonDetailsCache = this._salesPersonDetailsCache || {};
			if (this._salesPersonDetailsCache[key]) return this._salesPersonDetailsCache[key];

			const out = {
				name: row.sales_person || "",
				email: "",
				mobile: "",
				designation: "",
				allocated_percentage: Number(row.allocated_percentage || 0),
				contribution_to_net_total: Number(row.contribution_to_net_total || 0),
			};

			try {
				const r = await frappe.call({
					method: OPP_CFG.API.get_sales_person_details,
					args: {
						sales_person: row.sales_person || "",
						employee: row.employee || "",
					},
				});
				const server = r?.message || {};
				out.name = server.name || out.name;
				out.email = server.email || out.email;
				out.mobile = server.mobile || out.mobile;
				out.designation = server.designation || out.designation;
			} catch (e) {
				// keep silent fallbacks; card will still render with available row data
			}

			this._salesPersonDetailsCache[key] = out;
			return out;
		}

		async getRecommendedSupplierQuotationRateMap(opportunityName) {
			const empty = { exact_rate: {}, by_item_rate: {}, exact_amount: {}, by_item_amount: {} };
			const sourceName = String(opportunityName || "").trim();
			if (!sourceName) return empty;

			try {
				const sqRows = await frappe.db.get_list("Supplier Quotation", {
					fields: ["name", "modified"],
					filters: { opportunity: sourceName },
					order_by: "modified desc",
					limit: 500,
				});

				const sqNames = (sqRows || []).map((row) => String(row?.name || "").trim()).filter(Boolean);
				if (!sqNames.length) return empty;

				await frappe.model.with_doctype("Supplier Quotation Item");
				const sqItemMeta = frappe.get_meta("Supplier Quotation Item");
				const recommenderField = sqItemMeta?.fields?.some((df) => df.fieldname === "recommender")
					? "recommender"
					: (sqItemMeta?.fields?.some((df) => df.fieldname === "recommended_") ? "recommended_" : "");

				if (!recommenderField) return empty;

				const sqItemRows = await frappe.db.get_list("Supplier Quotation Item", {
					fields: ["parent", "item_code", "qty", "rate", "amount"],
					filters: {
						parent: ["in", sqNames],
						[recommenderField]: 1,
					},
					limit: 2000,
					order_by: "modified desc",
				});

				const recommendedParentSet = new Set(
					(sqItemRows || []).map((row) => String(row?.parent || "").trim()).filter(Boolean)
				);
				const selectedParent = sqNames.find((sqName) => recommendedParentSet.has(sqName)) || "";
				if (!selectedParent) return empty;

				const scopedRows = (sqItemRows || []).filter(
					(row) => String(row?.parent || "").trim() === selectedParent
				);

				const exactRate = {};
				const byItemRate = {};
				const exactAmount = {};
				const byItemAmount = {};
				const asNumber = (value) => {
					const parsed = parseFloat(String(value ?? "").replace(/,/g, "").trim());
					return Number.isFinite(parsed) ? parsed : 0;
				};

				scopedRows.forEach((row) => {
					const itemCode = String(row?.item_code || "").trim();
					if (!itemCode) return;

					const qtyKey = asNumber(row?.qty).toFixed(6);
					const exactKey = `${itemCode}::${qtyKey}`;
					const rate = asNumber(row?.rate);
					const amount = asNumber(row?.amount);

					if (rate > 0) {
						if (!exactRate[exactKey] || rate > exactRate[exactKey]) exactRate[exactKey] = rate;
						if (!byItemRate[itemCode] || rate > byItemRate[itemCode]) byItemRate[itemCode] = rate;
					}

					if (amount > 0) {
						if (!exactAmount[exactKey] || amount > exactAmount[exactKey]) exactAmount[exactKey] = amount;
						if (!byItemAmount[itemCode] || amount > byItemAmount[itemCode]) byItemAmount[itemCode] = amount;
					}
				});

				return {
					exact_rate: exactRate,
					by_item_rate: byItemRate,
					exact_amount: exactAmount,
					by_item_amount: byItemAmount,
				};
			} catch (e) {
				return empty;
			}
		}

		getItemSpqRateNumber(item = {}, fallback = 0) {
			const candidateFields = Array.isArray(arguments[2]) ? arguments[2] : [];
			const asNumber = (value) => {
				const parsed = parseFloat(String(value ?? "").replace(/,/g, "").trim());
				return Number.isFinite(parsed) ? parsed : 0;
			};
			const firstPositive = (...values) => values.map(asNumber).find((num) => num > 0) || 0;

			const candidateValues = candidateFields.map((fieldname) => item?.[fieldname]);
			const direct = firstPositive(...candidateValues, item.buying_rate, item.purchase_rate, item.custom_buying_rate);
			if (direct > 0) return direct;

			const dynamicKey = Object.keys(item || {}).find((key) => (
				/(buying|purchase).*rate/i.test(key)
				&& !/(commission|orc|value|sell|cost|valuation|list)/i.test(key)
			));
			if (dynamicKey) {
				const parsed = asNumber(item[dynamicKey]);
				if (parsed > 0) return parsed;
			}

			const parsedFallback = asNumber(fallback);
			return parsedFallback > 0 ? parsedFallback : 0;
		}

		getItemSpqAmountNumber(item = {}, fallback = 0) {
			const candidateFields = Array.isArray(arguments[2]) ? arguments[2] : [];
			const asNumber = (value) => {
				const parsed = parseFloat(String(value ?? "").replace(/,/g, "").trim());
				return Number.isFinite(parsed) ? parsed : 0;
			};
			const firstPositive = (...values) => values.map(asNumber).find((num) => num > 0) || 0;

			const candidateValues = candidateFields.map((fieldname) => item?.[fieldname]);
			const direct = firstPositive(...candidateValues, item.buying_amount, item.purchase_amount, item.custom_buying_amount);
			if (direct > 0) return direct;

			const dynamicKey = Object.keys(item || {}).find((key) => (
				/(buying|purchase).*amount/i.test(key)
				&& !/(commission|orc|value|sell|cost|valuation|list)/i.test(key)
			));
			if (dynamicKey) {
				const parsed = asNumber(item[dynamicKey]);
				if (parsed > 0) return parsed;
			}

			const parsedFallback = asNumber(fallback);
			return parsedFallback > 0 ? parsedFallback : 0;
		}

		async getOpportunityItemSpqFieldCandidates() {
			const sourceDoc = this._currentOpportunityDoc || {};
			const childDoctype = (sourceDoc.items && sourceDoc.items[0]?.doctype) || "Opportunity Item";
			if (this._spqFieldCandidates && this._spqFieldCandidates.childDoctype === childDoctype) {
				return this._spqFieldCandidates;
			}

			await frappe.model.with_doctype(childDoctype);
			const meta = frappe.get_meta(childDoctype);
			const dfs = Array.isArray(meta?.fields) ? meta.fields : [];

			const knownRateAliases = ["buying_rate", "purchase_rate", "custom_buying_rate"];
			const knownAmountAliases = ["buying_amount", "purchase_amount", "custom_buying_amount"];

			const isRateCandidate = (df = {}) => {
				const fieldname = String(df.fieldname || "").toLowerCase();
				const label = String(df.label || "").toLowerCase();
				if (!fieldname) return false;
				if (fieldname === "rate" || label === "rate") return false;
				if (/(commission|orc|valuation|list|selling|margin)/i.test(fieldname)) return false;
				if (/(commission|orc|valuation|list|selling|margin)/i.test(label)) return false;
				if (knownRateAliases.includes(fieldname)) return true;
				if (/(spq|buying|purchase|supplier|cost)/i.test(fieldname) && /rate/i.test(fieldname)) return true;
				if (/(spq|buying|purchase|supplier|cost)/i.test(label) && /rate/i.test(label)) return true;
				return false;
			};

			const isAmountCandidate = (df = {}) => {
				const fieldname = String(df.fieldname || "").toLowerCase();
				const label = String(df.label || "").toLowerCase();
				if (!fieldname) return false;
				if (fieldname === "amount" || label === "amount") return false;
				if (/(commission|orc|valuation|list|selling|margin)/i.test(fieldname)) return false;
				if (/(commission|orc|valuation|list|selling|margin)/i.test(label)) return false;
				if (knownAmountAliases.includes(fieldname)) return true;
				if (/(spq|buying|purchase|supplier|cost)/i.test(fieldname) && /amount/i.test(fieldname)) return true;
				if (/(spq|buying|purchase|supplier|cost)/i.test(label) && /amount/i.test(label)) return true;
				return false;
			};

			const metaRateFields = dfs.filter(isRateCandidate).map((df) => String(df.fieldname || "")).filter(Boolean);
			const metaAmountFields = dfs.filter(isAmountCandidate).map((df) => String(df.fieldname || "")).filter(Boolean);

			const unique = (arr = []) => Array.from(new Set(arr.filter(Boolean)));
			const rateFields = unique([...knownRateAliases, ...metaRateFields]);
			const amountFields = unique([...knownAmountAliases, ...metaAmountFields]);

			this._spqFieldCandidates = { childDoctype, rateFields, amountFields };
			return this._spqFieldCandidates;
		}

		async renderOpportunityItems(doc) {
			const $itemsTable = $("#detail-items-tbody");
			if (!$itemsTable.length) return;

			const isTruthyFlag = (value) => {
				if (typeof value === "boolean") return value;
				const normalized = String(value ?? "").trim().toLowerCase();
				return ["1", "true", "yes", "y", "on", "checked"].includes(normalized);
			};

			const items = doc.items || [];
			if (!items.length) {
				$itemsTable.html(`<tr><td colspan="9" class="muted">No line items</td></tr>`);
				this.setDetailOrcColumnsVisibility(false);
				return;
			}

			const hasOrcEnabledRow = items.some((item) => isTruthyFlag(item?.orc) || isTruthyFlag(item?.is_orc));
			const asNumber = (value) => {
				const parsed = parseFloat(String(value ?? "").replace(/,/g, "").trim());
				return Number.isFinite(parsed) ? parsed : 0;
			};

			const resolveRateValue = (item = {}, qtyNumber = 0) => {
				const commissionType = String(item.commission_type || "").trim().toLowerCase();
				const isUnitRate = /unit\s*rate/i.test(commissionType);
				const isValueType = /value/i.test(commissionType);
				const commissionAmountRaw = [
					item.commission_amount,
					item.orc_amount,
				].find((value) => String(value ?? "").trim() !== "");
				const commissionAmount = asNumber(commissionAmountRaw);

				const directRaw = [
					item.rate_value,
					item.ratevalue,
					item.commission_rate_value,
					item.orc_rate_value,
				].find((value) => String(value ?? "").trim() !== "");

				if (String(directRaw ?? "").trim() !== "") {
					const directRawText = String(directRaw ?? "").trim();
					const directValue = asNumber(directRaw);

					if (qtyNumber > 0 && /[a-z%]+$/i.test(directRawText)) {
						return { hasValue: true, value: (directValue / qtyNumber) };
					}

					if (isUnitRate) {
						const sourceAmount = commissionAmount > 0 ? commissionAmount : directValue;
						return {
							hasValue: true,
							value: qtyNumber > 0 ? (sourceAmount / qtyNumber) : 0,
						};
					}

					if (isValueType) {
						return { hasValue: true, value: directValue };
					}

					return { hasValue: true, value: directValue };
				}

				if (commissionAmount <= 0) {
					return { hasValue: false, value: 0 };
				}

				if (isUnitRate) {
					return {
						hasValue: true,
						value: qtyNumber > 0 ? (commissionAmount / qtyNumber) : 0,
					};
				}

				if (isValueType) {
					return { hasValue: true, value: commissionAmount };
				}

				return { hasValue: false, value: 0 };
			};

			const itemsHtml = items.map((item, idx) => {
				const rawName = String(item.name || "");
				const itemName = item.item_name || item.item_code || (rawName.startsWith("__new_row_") ? "" : rawName) || "";
				const itemSub = (item.item_name && item.item_code && item.item_name !== item.item_code)
					? item.item_code
					: (item.description || "");
				const brand = item.brand || "Others";
				const qty = fmtInt(item.qty || 0);
				const rate = fmtCurrency(item.rate || 0);
				const amount = fmtCurrency(item.amount || ((item.qty || 0) * (item.rate || 0)));
				const salesStage = doc[OPP_CFG.STATUS_FIELD] || "";
				const opportunityType = item.renewal_status
					|| item.opportunity_type
					|| item.custom_opportunity_type
					|| doc.renewal_status
					|| doc.opportunity_type
					|| doc.custom_opportunity_type
					|| "";
				const renewalId = item.renewal_id || doc.renewal_id || "";
				const rowName = item.name || "";
				const oppItemName = String(item.name || "").trim();
				const qtyNumber = asNumber(item.qty || 0);
				const rateNumber = asNumber(item.rate || 0);
				const isOrcEnabled = isTruthyFlag(item.orc) || isTruthyFlag(item.is_orc);
				const commissionType = String(item.commission_type || "").trim();
				const rateValueResolved = resolveRateValue(item, qtyNumber);
				const hasRateValue = rateValueResolved.hasValue;
				const rateValueNumber = rateValueResolved.value;
				const rateValueText = hasRateValue
					? frappe.format(rateValueNumber, { fieldtype: "Float" })
					: "-";
				const orcText = isOrcEnabled ? "✓" : "-";

				return `
      <tr data-opportunity-item-name="${frappe.utils.escape_html(oppItemName)}" data-row-name="${frappe.utils.escape_html(rowName)}" data-row-idx="${idx}">
        <td>
          <div class="line-item-title">
            <div class="name" title="${frappe.utils.escape_html(itemName)}">${frappe.utils.escape_html(itemName)}</div>
            ${itemSub ? `<div class="sub" title="${frappe.utils.escape_html(itemSub)}">${frappe.utils.escape_html(itemSub)}</div>` : ""}
          </div>
        </td>
        <td><span class="cell-ellipsis" title="${frappe.utils.escape_html(brand)}">${frappe.utils.escape_html(brand)}</span></td>
        <td class="line-items-center">${qty}</td>
        <td class="line-items-center">${rate}</td>
        <td class="line-items-center">${amount}</td>
        <td><span class="cell-ellipsis" title="${frappe.utils.escape_html(salesStage)}">${frappe.utils.escape_html(salesStage)}</span></td>
        <td><span class="cell-ellipsis" title="${frappe.utils.escape_html(opportunityType)}">${frappe.utils.escape_html(opportunityType)}</span></td>
        <td><span class="cell-ellipsis" title="${frappe.utils.escape_html(renewalId)}">${frappe.utils.escape_html(renewalId)}</span></td>
        <td class="line-items-center" title="${frappe.utils.escape_html(orcText)}">${frappe.utils.escape_html(orcText)}</td>
        <td><span class="cell-ellipsis" title="${frappe.utils.escape_html(isOrcEnabled ? (commissionType || "-") : "-")}">${frappe.utils.escape_html(isOrcEnabled ? (commissionType || "-") : "-")}</span></td>
        <td class="line-items-center" title="${frappe.utils.escape_html(isOrcEnabled ? rateValueText : "-")}">${frappe.utils.escape_html(isOrcEnabled ? rateValueText : "-")}</td>
        <td class="actions-col line-items-center">
					<button class="item-row-edit-btn" data-opportunity-item-name="${frappe.utils.escape_html(oppItemName)}" data-row-name="${frappe.utils.escape_html(rowName)}" data-row-idx="${idx}" title="Edit this item">
            <i class="fa fa-pencil"></i>
          </button>
					<button class="item-row-delete-btn" data-opportunity-item-name="${frappe.utils.escape_html(oppItemName)}" data-row-name="${frappe.utils.escape_html(rowName)}" data-row-idx="${idx}" title="Delete this item" style="margin-left:4px;">
            <i class="fa fa-trash" style="color:#e74c3c;"></i>
          </button>
        </td>
      </tr>
    `;
			}).join("");

			$itemsTable.html(itemsHtml);

			$itemsTable.find(".item-row-edit-btn").each(function () {
				const $btn = $(this);
				const idx = Number.parseInt(String($btn.attr("data-row-idx") || ""), 10);
				const rowDoc = Number.isFinite(idx) && idx >= 0 ? (items[idx] || null) : null;
				$btn.data("itemDoc", rowDoc ? { ...rowDoc } : null);
			});

			this.setDetailOrcColumnsVisibility(hasOrcEnabledRow);
			this.applyDetailItemHighlight();
			if (this._detailItemFilters && Object.values(this._detailItemFilters).some((value) => String(value || "").trim())) {
				this.filterDetailItemsTable(this._detailItemFilters);
			}
		}

		setDetailOrcColumnsVisibility(showColumns = false) {
			const $table = $("#detail-items-tbody").closest("table");
			if (!$table.length) return;

			const shouldShow = Boolean(showColumns);
			$table.find(
				"thead th:nth-child(9), thead th:nth-child(10), thead th:nth-child(11), "
				+ "tbody td:nth-child(9), tbody td:nth-child(10), tbody td:nth-child(11)"
			).toggle(shouldShow);
		}

		setActiveNewOppRowHighlight($row = null) {
			const $tbody = $(this.page.wrapper).find("#new-opp-items-table-body");
			if (!$tbody.length) return;

			$tbody.find("tr.new-opp-item-main-row").removeClass("is-active-edit-row");

			const $target = $row && $row.length ? $row : $();
			if ($target.length) {
				$target.addClass("is-active-edit-row");
				this._newOppActiveEditRow = $target;
			} else {
				this._newOppActiveEditRow = null;
			}
		}

		clearActiveNewOppRowHighlight() {
			const $tbody = $(this.page.wrapper).find("#new-opp-items-table-body");
			if ($tbody.length) {
				$tbody.find("tr.new-opp-item-main-row").removeClass("is-active-edit-row");
			}
			this._newOppActiveEditRow = null;
		}

		setActiveDetailItemHighlight(rowName = "", rowIdx = null) {
			this._detailActiveItemRowName = String(rowName || "").trim();
			this._detailActiveItemRowIdx = Number.isFinite(rowIdx) ? Number(rowIdx) : null;
			this.applyDetailItemHighlight();
		}

		clearActiveDetailItemHighlight() {
			this._detailActiveItemRowName = "";
			this._detailActiveItemRowIdx = null;
			this.applyDetailItemHighlight();
		}

		applyDetailItemHighlight() {
			const $tbody = $("#detail-items-tbody");
			if (!$tbody.length) return;

			$tbody.find("tr").removeClass("is-active-detail-row");

			const activeRowName = String(this._detailActiveItemRowName || "").trim();
			const activeRowIdx = Number.isFinite(this._detailActiveItemRowIdx)
				? Number(this._detailActiveItemRowIdx)
				: null;

			let $target = $();
			if (activeRowName) {
				$target = $tbody.find("tr").filter(function () {
					const rowIdentity = String($(this).attr("data-opportunity-item-name") || "").trim();
					const rowNameAttr = String($(this).attr("data-row-name") || "").trim();
					return rowIdentity === activeRowName || rowNameAttr === activeRowName;
				}).first();
			}

			if (!$target.length && Number.isFinite(activeRowIdx) && activeRowIdx >= 0) {
				$target = $tbody.find("tr").filter(function () {
					return parseInt($(this).attr("data-row-idx"), 10) === activeRowIdx;
				}).first();
			}

			if ($target.length) {
				$target.addClass("is-active-detail-row");
			}
		}

		bindOpportunityItemRowActions() {
			const me = this;
			const $tbody = $("#detail-items-tbody");
			const $scope = $(this.page.wrapper);

			// Keep only the Actions dropdown as the add entry point in detail view.
			$("#detail-add-item-row, #detail-add-item-row-bottom").addClass("d-none");

			$("#detail-add-item-row-action")
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard();
				});

			$("#detail-add-item-row-renewal")
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard("Renewal");
				});

			$("#detail-add-item-row-additional")
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					me.openNewOppItemWizard("Additional");
				});

			$tbody
				.off("click", ".item-row-edit-btn")
				.on("click", ".item-row-edit-btn", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const $clickedRow = $(this).closest("tr");
					const opportunityItemName = String(
						$clickedRow.attr("data-opportunity-item-name")
						|| $(this).attr("data-opportunity-item-name")
						|| $(this).data("opportunity-item-name")
						|| ""
					).trim();
					const rowName = String(
						$clickedRow.attr("data-row-name")
						|| $(this).attr("data-row-name")
						|| $(this).data("row-name")
						|| ""
					).trim();
					const rowIdxRaw = $clickedRow.attr("data-row-idx")
						?? $(this).attr("data-row-idx")
						?? $(this).data("row-idx");
					const rowIdx = Number.parseInt(String(rowIdxRaw ?? ""), 10);
					const resolvedRowKey = opportunityItemName || rowName;
					me.setActiveDetailItemHighlight(resolvedRowKey, rowIdx);

					const sourceDoc = me._currentOpportunityDoc || {};
					const rows = Array.isArray(sourceDoc.items) ? sourceDoc.items : [];
					const directRow = $(this).data("itemDoc");
					const row = (directRow && typeof directRow === "object" ? directRow : null)
						|| (Number.isFinite(rowIdx) && rowIdx >= 0 ? rows[rowIdx] : null)
						|| (resolvedRowKey ? rows.find((r) => String(r?.name || "").trim() === resolvedRowKey) : null)
						|| (rowName ? rows.find((r) => String(r?.name || "").trim() === rowName) : null);
					if (!row) return;

					const qty = Number(row.qty || 1) || 1;
					const rate = Number(row.rate || 0) || 0;

					const editItemData = {
						opportunity_type: String(row.renewal_status || row.opportunity_type || row.custom_opportunity_type || "New").trim() || "New",
						item_code: String(row.item_code || "").trim(),
						item_name: String(row.item_name || row.item_code || "").trim(),
						qty,
						rate,
						amount: Number(row.amount || (qty * rate)) || (qty * rate),
						brand: String(row.brand || "").trim(),
						item_group: String(row.item_group || "").trim(),
						description: String(row.description || "").trim(),
						hsncode: String(row.hsncode || row.hsn_code || row.gst_hsn_code || "").trim(),
						uom: String(row.uom || row.stock_uom || "").trim(),
						renewal_id: String(row.renewal_id || "").trim(),
						orc: Number(row.orc || row.is_orc || 0) ? 1 : 0,
						commission_type: String(row.commission_type || "").trim(),
						rate_value: Number(row.rate_value || 0),
						_editContext: "detail",
						_editRowName: String(row.name || resolvedRowKey || rowName || "").trim(),
						_editRowIdx: Number.isFinite(rowIdx) && rowIdx >= 0 ? rowIdx : rows.indexOf(row),
					};

					me.openNewOppItemWizard(null, editItemData);
				});

			$tbody
				.off("click", ".item-row-delete-btn")
				.on("click", ".item-row-delete-btn", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const docname = me._currentOpportunityName;
					if (!docname) return;
					const rowName = String($(this).data("row-name") || "").trim();
					const rowIdx = parseInt($(this).data("row-idx"), 10);

					frappe.confirm(
						__("Are you sure you want to delete this item row?"),
						async () => {
							// confirmed
							const latestDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, docname).catch(() => null);
							if (!latestDoc || !Array.isArray(latestDoc.items)) return;
							if (
								String(me._detailActiveItemRowName || "").trim() === rowName
								|| (Number.isFinite(me._detailActiveItemRowIdx) && Number(me._detailActiveItemRowIdx) === rowIdx)
							) {
								me.clearActiveDetailItemHighlight();
							}
							if (rowName) {
								latestDoc.items = latestDoc.items.filter((r) => String(r?.name || "") !== rowName);
							} else if (Number.isFinite(rowIdx) && rowIdx >= 0) {
								latestDoc.items = latestDoc.items.filter((_, i) => i !== rowIdx);
							} else {
								return;
							}
							frappe.call({
								method: "frappe.client.save",
								args: { doc: me.prepareDocForSave(latestDoc) },
								freeze: true,
								freeze_message: __("Deleting item..."),
								callback: () => {
									frappe.show_alert({ message: __("Item deleted"), indicator: "orange" });
									me.load_doc_details(docname);
								},
							});
						}
					);
				});

			// ===== DETAIL VIEW ITEMS FILTER BUTTON =====
			$("#detail-items-filter-btn")
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					e.stopPropagation();
					me.openDetailItemsFilterPopover($(this));
				});
		}

		openDetailItemsFilterPopover($btn) {
			const me = this;
			if ($btn.data("bs.popover")) {
				$btn.popover("dispose");
				return;
			}

			let pop = $('<div class="filter-area">');

			// ===== ITEM CODE FILTER FIRST (PRIMARY) =====
			let itemCodeFilterHtml = $(`
			<div class="item-code-filter mb-3 p-2" style="border-bottom: 2px solid #007bff; padding-bottom: 10px;">
				<label class="block text-muted small" style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">ITEM CODE (Search First)</label>
				<input type="text" class="form-control form-control-sm" placeholder="Search by item code..." data-filter-field="item-code" style="font-size: 12px; padding: 6px 8px;">
			</div>
		`);
			pop.append(itemCodeFilterHtml);

			// ===== QUICK TEXT FILTERS =====
			let customFiltersHtml = $(`
			<div class="custom-quick-filters mb-3 p-2" style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">
				<div class="filter-field mb-2">
					<label class="block text-muted small" style="font-size: 11px; margin-bottom: 4px;">Brand</label>
					<input type="text" class="form-control form-control-sm" placeholder="Search brand" data-filter-field="brand" style="font-size: 12px;">
				</div>
				<div class="filter-field mb-2">
					<label class="block text-muted small" style="font-size: 11px; margin-bottom: 4px;">Item Group / Type</label>
					<input type="text" class="form-control form-control-sm" placeholder="Search item group or type" data-filter-field="item-group" style="font-size: 12px;">
				</div>
				<div class="filter-field mb-2">
					<label class="block text-muted small" style="font-size: 11px; margin-bottom: 4px;">Status</label>
					<input type="text" class="form-control form-control-sm" placeholder="Search status" data-filter-field="status" style="font-size: 12px;">
				</div>
				<div class="filter-actions d-flex justify-content-between" style="gap: 8px; margin-top: 10px;">
					<button type="button" class="btn btn-default btn-sm" data-filter-action="reset" style="flex: 1;">Reset</button>
					<button type="button" class="btn btn-primary btn-sm" data-filter-action="apply" style="flex: 1;">Apply</button>
				</div>
			</div>
		`);
			pop.append(customFiltersHtml);

			$btn.popover({
				html: true,
				sanitize: false,
				trigger: "manual",
				placement: "bottom",
				container: "body",
				content: pop,
			});
			$btn.popover("show");

			const tipId = $btn.attr("aria-describedby");
			const $tip = tipId ? $(`#${tipId}`) : $(".popover:last");
			const $popoverBody = $tip.find(".popover-body");
			const activeFilters = this._detailItemFilters || {};
			$popoverBody.find("[data-filter-field='item-code']").val(activeFilters.itemCode || "");
			$popoverBody.find("[data-filter-field='brand']").val(activeFilters.brand || "");
			$popoverBody.find("[data-filter-field='item-group']").val(activeFilters.itemGroup || "");
			$popoverBody.find("[data-filter-field='status']").val(activeFilters.status || "");

			const applyFilters = () => {
				const filters = {
					itemCode: String($popoverBody.find("[data-filter-field='item-code']").val() || "").trim(),
					brand: String($popoverBody.find("[data-filter-field='brand']").val() || "").trim(),
					itemGroup: String($popoverBody.find("[data-filter-field='item-group']").val() || "").trim(),
					status: String($popoverBody.find("[data-filter-field='status']").val() || "").trim(),
				};
				this._detailItemFilters = filters;
				this.filterDetailItemsTable(filters);
				$btn.popover("dispose");
			};

			$popoverBody.find("[data-filter-action='apply']").off("click").on("click", applyFilters);
			$popoverBody.find("[data-filter-action='reset']").off("click").on("click", () => {
				this._detailItemFilters = {};
				this.filterDetailItemsTable({});
				$btn.popover("dispose");
			});
			$popoverBody.find("input").off("keydown").on("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					applyFilters();
				}
			});

			setTimeout(() => {
				$popoverBody.find("[data-filter-field='item-code']").trigger("focus");
			}, 0);

			$(document)
				.off("mousedown.detail-items-filter")
				.on("mousedown.detail-items-filter", (e) => {
					const $target = $(e.target);
					if ($target.closest(".popover").length || $target.closest("#detail-items-filter-btn").length) {
						return;
					}
					$btn.popover("dispose");
					$(document).off("mousedown.detail-items-filter");
				});
		}

		filterDetailItemsTable(filters = {}) {
			const normalized = {
				itemCode: String(filters.itemCode || "").trim().toLowerCase(),
				brand: String(filters.brand || "").trim().toLowerCase(),
				itemGroup: String(filters.itemGroup || "").trim().toLowerCase(),
				status: String(filters.status || "").trim().toLowerCase(),
			};
			const $tbody = $("#detail-items-tbody");
			if (!$tbody.length) return;

			$tbody.find(".no-filter-results").remove();
			const $rows = $tbody.children("tr").not(".no-filter-results");
			$rows.each(function () {
				const $row = $(this);
				const itemText = String($row.find("td:nth-child(1)").text() || "").trim().toLowerCase();
				const brandText = String($row.find("td:nth-child(2)").text() || "").trim().toLowerCase();
				const statusText = String($row.find("td:nth-child(9)").text() || "").trim().toLowerCase();
				const opportunityTypeText = String($row.find("td:nth-child(10)").text() || "").trim().toLowerCase();
				const rowVisible = (!normalized.itemCode || itemText.includes(normalized.itemCode))
					&& (!normalized.brand || brandText.includes(normalized.brand))
					&& (!normalized.itemGroup || itemText.includes(normalized.itemGroup) || opportunityTypeText.includes(normalized.itemGroup))
					&& (!normalized.status || statusText.includes(normalized.status));
				$row.toggle(rowVisible);
			});

			if ($rows.filter(":visible").length === 0) {
				const colspan = $tbody.closest("table").find("thead th:visible").length || 1;
				$tbody.append(`<tr class="no-filter-results"><td colspan="${colspan}" class="muted text-center">No items match your filters</td></tr>`);
			}
		}
		/*
				});
				// Show "No results" message if all rows are hidden
				const visibleRows = $rows.filter(":visible").length;
				if (visibleRows === 0) {
					const colspan = $tbody.closest("table").find("thead th").length;
					if (!$tbody.find(".no-filter-results").length) {
						$tbody.append(`<tr class="no-filter-results"><td colspan="${colspan}" class="muted text-center">No items match your filters</td></tr>`);
				if (directCandidateExists && isOrcEnabled && qty > 0 && /[a-z%]+$/i.test(directCandidateText)) {
					rateValue = rateValue / qty;
									name: `__new_row_${Date.now()}`,
					const sourceAmount = commissionAmount > 0
						? commissionAmount
						: (directCandidateExists ? rateValue : 0);
									rate: Number(preset.rate || 0),
									amount: Number(preset.amount || (Number(preset.qty || 1) * Number(preset.rate || 0))) || 0,
									orc: Number(preset.orc || 0) ? 1 : 0,
									commission_type: String(preset.commission_type || ""),
									rate_value: Number(preset.rate_value || 0),
									status: String(preset.status || sourceDoc.status || ""),
									opportunity_type: String(preset.renewal_status || preset.opportunity_type || sourceDoc.renewal_status || sourceDoc.opportunity_type || ""),
					return raw;
				};
		
				let itemStatus = pickFirstNonEmpty(
					row.status,
					row.stage,
					sourceDoc[OPP_CFG.STATUS_FIELD],
					sourceDoc.status,
					sourceDoc.stage
				);
		
				let opportunityType = pickFirstNonEmpty(
					row.renewal_status,
					row.opportunity_type,
					row.custom_opportunity_type,
					row.type,
					sourceDoc.renewal_status,
					sourceDoc.opportunity_type,
					sourceDoc.custom_opportunity_type,
					sourceDoc.type
				);
		
				const renewalId = row.renewal_id || sourceDoc.renewal_id || "";
		
				const targetSelector = rowName
					? `tr[data-row-name="${rowName.replace(/"/g, '&quot;')}"]`
					: `tr[data-row-idx="${rowIdx}"]`;
				const $mainRow = $("#detail-items-tbody").find(targetSelector).first();
				if (!$mainRow.length) return;
		
				// Keep main row visible; always show a dedicated inline editor row below it.
				const $tbody = $("#detail-items-tbody");
				const $tableWrap = $mainRow.closest(".table-wrap");
				$tbody.find("tr.item-inline-edit-row").remove();
				$tableWrap.find("#detail-items-inline-editor-panel").remove();
				$tbody.find("tr[data-editing='1']").removeAttr("data-editing");
		
				// Fallback from currently rendered row text when row payload misses any field.
				const shownStatus = String($mainRow.find("td:nth-child(9) .cell-ellipsis").text() || "").trim();
				const shownOpportunityType = String($mainRow.find("td:nth-child(10) .cell-ellipsis").text() || "").trim();
				itemStatus = pickFirstNonEmpty(itemStatus, shownStatus);
				opportunityType = pickFirstNonEmpty(opportunityType, shownOpportunityType);
		
				const hasAnyOrcEnabled = rows.some((r) => isTruthyFlag(r?.orc) || isTruthyFlag(r?.is_orc));
				this.setDetailOrcColumnsVisibility(hasAnyOrcEnabled || isOrcEnabled);
		
				const buildSelectOptions = (options = [], currentValue = "") => {
					const normalized = Array.from(new Set(
						(options || [])
							.map((opt) => String(opt || "").trim())
							.filter(Boolean)
					));
					const current = String(currentValue || "").trim();
					if (current && !normalized.includes(current)) normalized.push(current);
					return ["", ...normalized]
						.map((opt) => `<option value="${frappe.utils.escape_html(opt)}" ${opt === current ? "selected" : ""}>${frappe.utils.escape_html(opt || "Select")}</option>`)
						.join("");
				};
		
				const opportunityTypeOptions = String(fieldMeta?.opportunity_type?.options || "")
					.split("\n")
					.map((v) => v.trim())
					.filter(Boolean);
				["New", "Renewal", "Additional", "Add-on", "Sales"].forEach((opt) => {
					if (!opportunityTypeOptions.includes(opt)) opportunityTypeOptions.push(opt);
				});
				const opportunityTypeOptionsHtml = buildSelectOptions(opportunityTypeOptions, opportunityType);
				const statusOptions = String(fieldMeta?.status?.options || "")
					.split("\n")
					.map((v) => v.trim())
					.filter(Boolean);
				const statusOptionsHtml = buildSelectOptions(statusOptions, itemStatus);
		
				const detailCols = Math.max(
					$mainRow.children("td").length,
					$mainRow.closest("table").find("thead tr th").length,
					1
				);
		
				const panelCols = Math.max(detailCols - 1, 1);
		
				const inlineHtml = `
				<tr class="item-inline-edit-row" data-row-name="${frappe.utils.escape_html(rowName)}" data-row-idx="${rowIdx}" data-editing="1">
					<td colspan="${panelCols}">
				<div id="detail-items-inline-editor-panel" class="item-inline-editor-panel" data-row-name="${frappe.utils.escape_html(rowName)}" data-row-idx="${rowIdx}" data-editing="1" style="margin-top:12px;border:1px solid #d7deea;border-radius:10px;background:#fff;padding:14px;box-shadow:0 10px 24px rgba(15,23,42,0.08);font-size:12px;">
					<div class="item-inline-header d-flex justify-content-between align-items-center mb-3" style="position:sticky;top:0;left:0;z-index:102; background:#fff; overflow:hidden; padding:8px 0;">
						<div>
							<strong>Edit Item (Inline)</strong>
						</div>
						<div class="inline-edit-actions-stack">
							<button class="btn btn-primary btn-sm item-row-save" title="Save"><i class="fa fa-check"></i></button>
							<button class="btn btn-default btn-sm item-row-cancel" title="Close"><i class="fa fa-times"></i></button>
						</div>
					</div>
					<div style="margin-top:6px;border-top:1px solid #e5e7eb;padding-top:10px;">
						<div style="font-weight:600;margin-bottom:8px;">1. Basic Details</div>
						<div class="row" style="row-gap:10px;">
							<div class="col-md-4"><label>Item Code</label><div class="item-code-link-control"></div></div>
							<div class="col-md-4"><label>Item Name</label><div class="form-control item-edit-item-name-preview" style="height:auto;" title="${frappe.utils.escape_html(itemName)}">${frappe.utils.escape_html(itemName)}</div></div>
							<div class="col-md-4"><label>Brand</label><div class="form-control item-edit-brand-preview" style="height:auto;" title="${frappe.utils.escape_html(brand)}">${frappe.utils.escape_html(brand)}</div></div>
							<div class="col-md-4"><label>Opportunity Type</label>
								<select class="form-control item-edit-input item-edit-opportunity-type">${opportunityTypeOptionsHtml}</select>
							</div>
							<div class="col-md-4"><label>Status</label>
								<select class="form-control item-edit-input item-edit-status">${statusOptionsHtml}</select>
							</div>
							<div class="col-md-12">
								<div class="item-edit-four-col-row">
									<div class="item-edit-four-col-field"><label>Qty</label><input type="text" inputmode="numeric" pattern="[0-9]*" class="form-control item-edit-input item-edit-qty" value="${qty}"></div>
									<div class="item-edit-four-col-field"><label>Rate</label><input type="number" step="0.01" min="0" class="form-control item-edit-input item-edit-rate" value="${rate}"></div>
									<div class="item-edit-four-col-field"><label>Amount</label><div class="form-control" style="height:auto;"><span class="item-edit-amount">${fmtCurrency(row.amount)}</span></div></div>
									<div class="item-edit-four-col-field"><label>Renewal ID</label><input type="text" class="form-control item-edit-input item-edit-renewal-id" value="${frappe.utils.escape_html(renewalId || "")}"></div>
								</div>
							</div>
						</div>
					</div>
		
					<div style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:10px;">
						<div style="font-weight:600;margin-bottom:8px;">2. ORC Details</div>
						<div class="row" style="row-gap:10px;">
							<div class="col-md-4"><label>ORC</label><div class="line-items-center" style="height:34px;"><input type="checkbox" class="item-edit-orc" ${isOrcEnabled ? "checked" : ""}></div></div>
							<div class="col-md-4"><label>Commission Type</label>
							<select class="form-control item-edit-input item-edit-commission-type" ${isOrcEnabled ? "" : "style=\"display:none;\""}>
								<option value="">Select</option>
								<option value="Unit Rate" ${commissionType === "Unit Rate" ? "selected" : ""}>Unit Rate</option>
								<option value="Value" ${commissionType === "Value" ? "selected" : ""}>Value</option>
							</select>
							<span class="item-edit-commission-type-empty ${isOrcEnabled ? "d-none" : ""}">-</span>
							</div>
							<div class="col-md-4"><label>Rate Value</label>
							<input type="number" min="0" step="0.01" class="form-control item-edit-input item-edit-rate-value" value="${isOrcEnabled ? rateValue : 0}" ${isOrcEnabled ? "" : "style=\"display:none;\""}>
							<span class="item-edit-rate-value-empty ${isOrcEnabled ? "d-none" : ""}">-</span>
							</div>
						</div>
					</div>
		
					<input type="hidden" class="item-edit-item-name" value="${frappe.utils.escape_html(itemName || itemCode || "")}">
					<div style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:10px;">
						<div style="font-weight:600;margin-bottom:8px;">Additional Fields</div>
						<div class="row item-edit-extra-fields" style="row-gap:10px;"></div>
					</div>
				</div>
					</td>
				</tr>
			`;
		
				$mainRow.after(inlineHtml);
				const $target = $mainRow.nextAll("tr.item-inline-edit-row").first().find("#detail-items-inline-editor-panel").first();
				$target.closest(".table-wrap").addClass("is-inline-editing");
		
				const syncItemNamePreview = (value = "") => {
					const clean = String(value || "").trim();
					const safe = frappe.utils.escape_html(clean);
					$target.find(".item-edit-item-name-preview").attr("title", safe).text(safe || "-");
					$target.find(".item-edit-item-name").val(clean);
				};
		
				const applyItemAutofillByCode = async (selectedCode = "", force = false) => {
					if ($target.data("_suppressDetailItemAutofill")) return;
					const code = String(selectedCode || "").trim();
					if (!code) return;
					const codeChanged = code !== initialInlineItemCode;
					if (!force && !codeChanged) return;
					syncItemNamePreview(code);
		
					const itemMeta = await this.getItemAutofill(code);
					if (!itemMeta) return;
		
					$target.data("itemMeta", itemMeta);
					const qtyVal = parseInt(String($target.find(".item-edit-qty").val() || "").replace(/\D+/g, ""), 10) || 0;
					const newRate = Number(itemMeta.rate || 0);
					const manualRateEdited = Boolean($target.data("_detailManualRateEdited"));
					if (codeChanged || !manualRateEdited) {
						$target.find(".item-edit-rate").val(newRate);
					}
					$target.find(".item-edit-amount").text(fmtCurrency(qtyVal * newRate));
					const brandText = frappe.utils.escape_html(itemMeta.brand || "Others");
					$target.find(".item-edit-brand-preview").attr("title", brandText).text(brandText);
					const itemNameText = frappe.utils.escape_html(itemMeta.item_name || code || "");
					$target.find(".item-edit-item-name-preview").attr("title", itemNameText).text(itemNameText);
					$target.find(".item-edit-item-name").val(String(itemMeta.item_name || code || "").trim());
		
					const extraItemControls = $target.data("extraItemControls") || {};
					if (extraItemControls.uom?.set_value) {
						extraItemControls.uom.set_value(String(itemMeta.uom || "").trim());
					}
					if (extraItemControls.description?.set_value) {
						extraItemControls.description.set_value(String(itemMeta.description_html || itemMeta.description || "").trim());
					}
		
					$mainRow.find("td:nth-child(2)").html(`<span class="cell-ellipsis" title="${brandText}">${brandText}</span>`);
				};
		
				const $itemCodeWrap = $target.find(".item-code-link-control");
				if ($itemCodeWrap.length && frappe?.ui?.form?.make_control) {
					const linkControl = frappe.ui.form.make_control({
						parent: $itemCodeWrap,
						df: {
							fieldtype: "Link",
							fieldname: "item_code_inline",
							label: "",
							only_input: true,
							options: "Item",
							placeholder: __("Item Code"),
							onchange: async () => {
								await applyItemAutofillByCode(linkControl.get_value());
							},
						},
						render_input: true,
					});
		
					$target.data("_suppressDetailItemAutofill", true);
					linkControl.set_value(itemCode || "");
					$target.removeData("_suppressDetailItemAutofill");
					$target.data("itemLinkControl", linkControl);
					this.configureItemAdvancedSearch(linkControl);
					this.attachInlineLinkPortal(linkControl);
		
					const $input = linkControl.$input;
					if ($input && $input.length) {
						$input
							.off("input.itemAutofill change.itemAutofill blur.itemAutofill awesomplete-selectcomplete.itemAutofill awesomplete-select.itemAutofill")
							.on("input.itemAutofill", function () {
								syncItemNamePreview($(this).val());
							})
							.on("change.itemAutofill blur.itemAutofill awesomplete-selectcomplete.itemAutofill awesomplete-select.itemAutofill", function () {
								applyItemAutofillByCode(linkControl.get_value());
							});
		
						$target.find(".item-edit-rate")
							.off("input.detailManualRateFlag change.detailManualRateFlag")
							.on("input.detailManualRateFlag change.detailManualRateFlag", () => {
								$target.data("_detailManualRateEdited", true);
							});
		
						setTimeout(() => {
							try {
								$input.trigger("focus");
							} catch (e) {
								// no-op
							}
						}, 0);
					}
		
					if (String(itemCode || "").trim()) {
						setTimeout(() => applyItemAutofillByCode(itemCode, false), 0);
					}
				}
		
				const makeInlineControl = ($container, df, value, dataKey, extraDf = {}) => {
					if (!$container.length || !frappe?.ui?.form?.make_control) return;
					let options = df.options || "";
		
					if (dataKey === "opportunityTypeControl") {
						const defaultTypeOptions = ["New", "Renewal", "Additional", "Add-on", "Sales"];
						const existingTypeOptions = String(options || "")
							.split("\n")
							.map((v) => v.trim())
							.filter(Boolean);
		
						for (const opt of defaultTypeOptions) {
							if (!existingTypeOptions.includes(opt)) {
								existingTypeOptions.push(opt);
							}
						}
						options = existingTypeOptions.join("\n");
					}
		
					if ((df.fieldtype || "").toLowerCase() === "select") {
						const existing = String(options || "")
							.split("\n")
							.map((v) => v.trim())
							.filter(Boolean);
						const current = String(value || "").trim();
						if (current && !existing.includes(current)) {
							existing.push(current);
							options = existing.join("\n");
						}
					}
		
					const ctrl = frappe.ui.form.make_control({
						parent: $container,
						df: {
							fieldtype: df.fieldtype || "Data",
							fieldname: dataKey,
							label: "",
							only_input: true,
							options,
							...extraDf,
						},
						render_input: true,
					});
					ctrl.set_value(value || "");
					$target.data(dataKey, ctrl);
					if (ctrl.$wrapper?.length) {
						ctrl.$wrapper.css({ marginBottom: "0", width: "100%" });
						ctrl.$wrapper.find(".form-group, .clearfix").css({ marginBottom: "0" });
						ctrl.$wrapper.find(".control-input-wrapper, .awesomplete, .input-with-feedback").css({ width: "100%" });
					}
					this.attachInlineLinkPortal(ctrl);
				};
		
				$target.data("statusControl", null);
				$target.data("opportunityTypeControl", null);
		
				$target.data("renewalIdControl", null);
		
				const extraControls = {};
				const $extraWrap = $target.find(".item-edit-extra-fields");
		
				// UOM field
				$extraWrap.append(`
					<div class="col-md-4 item-edit-extra-cell">
						<label>UOM</label>
						<div class="item-edit-extra-control" data-fieldname="uom"></div>
					</div>
				`);
				const $uomHolder = $extraWrap.find(".item-edit-extra-control[data-fieldname='uom']").last();
				if ($uomHolder.length && frappe?.ui?.form?.make_control) {
					const uomCtrl = frappe.ui.form.make_control({
						parent: $uomHolder,
						df: { fieldtype: "Link", fieldname: "uom", label: "", options: "UOM" },
						render_input: true,
					});
					uomCtrl.set_value(row?.uom || "");
					extraControls["uom"] = uomCtrl;
					this.attachInlineLinkPortal(uomCtrl);
				}
		
				// Description field
				$extraWrap.append(`
					<div class="col-md-12 item-edit-extra-cell">
						<label>Description</label>
						<div class="item-edit-extra-control" data-fieldname="description"></div>
					</div>
				`);
				const $descHolder = $extraWrap.find(".item-edit-extra-control[data-fieldname='description']").last();
				if ($descHolder.length && frappe?.ui?.form?.make_control) {
					const descCtrl = frappe.ui.form.make_control({
						parent: $descHolder,
						df: { fieldtype: "Text Editor", fieldname: "description", label: "" },
						render_input: true,
					});
					descCtrl.set_value(row?.description || "");
					extraControls["description"] = descCtrl;
					const $input = descCtrl.$input || descCtrl.$wrapper?.find("textarea");
					if ($input?.length) $input.css({ minHeight: "140px", resize: "vertical" });
				}
		
				$target.data("extraItemControls", extraControls);
		
				const toggleOrcFields = () => {
					const enabled = $target.find(".item-edit-orc").is(":checked");
					const $commission = $target.find(".item-edit-commission-type");
					const $rateValue = $target.find(".item-edit-rate-value");
					const $commissionEmpty = $target.find(".item-edit-commission-type-empty");
					const $rateValueEmpty = $target.find(".item-edit-rate-value-empty");
		
					$commission.toggle(enabled);
					$rateValue.toggle(enabled);
					$commissionEmpty.toggleClass("d-none", enabled);
					$rateValueEmpty.toggleClass("d-none", enabled);
		
					if (!enabled) {
						$commission.val("");
						$rateValue.val(0);
					}
		
					const hasAnyCurrentOrc = (sourceDoc.items || []).some((r) => isTruthyFlag(r?.orc) || isTruthyFlag(r?.is_orc));
					const hasAnyCheckedInEditRows = $("#detail-items-tbody .item-edit-orc:checked").length > 0;
					this.setDetailOrcColumnsVisibility(enabled || hasAnyCurrentOrc || hasAnyCheckedInEditRows);
				};
		
				$target.find(".item-edit-orc").off("change").on("change", toggleOrcFields);
				toggleOrcFields();
		
				// Keep all label/control blocks aligned despite mixed native and frappe controls.
				$target.find("label").css({ display: "block", marginBottom: "6px", fontWeight: "500" });
				$target.find(".form-control").css({ minHeight: "38px" });
				$target.find(".item-edit-input").css({ minHeight: "38px" });
				$target.find(".item-code-link-control, .item-edit-status-control, .item-edit-opportunity-type-control").each(function () {
					$(this).find(".frappe-control, .form-group, .clearfix").css({ marginBottom: "0" });
					$(this).find(".control-input-wrapper, .awesomplete, .input-with-feedback").css({ width: "100%" });
					$(this).find("input, select").css({ minHeight: "38px" });
				});
				$target.find(".item-inline-control .frappe-control").css({ marginTop: "0", paddingTop: "0" });
			}
		
			async addDetailItemRow(preset = {}, options = {}) {
				const openInlineEditor = options.openInlineEditor !== false;
				const persistImmediately = Boolean(options.persist);
				const sourceDoc = this._currentOpportunityDoc || {};
				if (!Array.isArray(sourceDoc.items)) sourceDoc.items = [];
		
				const childDoctype = sourceDoc.items?.[0]?.doctype || "Opportunity Item";
		
				// Flush whatever is currently in the live edit row back into sourceDoc.items
				// so it survives the re-render. Always use the DOM row with data-editing="1"
				// — not the first __new_row_ in the array — because after multiple adds the
				// currently-editing row is never necessarily the first __new_row_ in the list.
				const $editingRow = $("#detail-items-inline-editor-panel[data-editing='1'], #detail-items-tbody tr[data-editing='1']").first();
				if ($editingRow.length) {
					const editingRowName = ($editingRow.attr("data-row-name") || "").trim();
					const docRow = sourceDoc.items.find((r) => r.name === editingRowName);
		
					const linkControl = $editingRow.data("itemLinkControl");
					const currentItemCode = (linkControl && typeof linkControl.get_value === "function")
						? (linkControl.get_value() || "").trim()
						: String($editingRow.find(".item-code-link-control input, .item-edit-item-code").first().val() || "").trim();
		
					if (!currentItemCode) {
						// Nothing selected in the current edit row — re-focus it instead of adding a new one.
						frappe.show_alert({ message: __("Please select an item in the current row first."), indicator: "orange" }, 3);
						if (docRow) {
							const existingIdx = sourceDoc.items.findIndex((r) => r.name === editingRowName);
							await this.renderOpportunityItems(sourceDoc);
							this.bindOpportunityItemRowActions();
							this.enterOpportunityItemInlineEdit(editingRowName, existingIdx);
						}
						return;
					}
		
					// Write live DOM values back to sourceDoc so re-render shows them.
					if (docRow) {
						docRow.item_code = currentItemCode;
						docRow.item_name = currentItemCode;
						docRow.qty = parseInt($editingRow.find(".item-edit-qty").val() || "1", 10) || 1;
						docRow.rate = parseFloat($editingRow.find(".item-edit-rate").val() || "0") || 0;
						docRow.amount = docRow.qty * docRow.rate;
						const cachedMeta = $editingRow.data("itemMeta");
						if (cachedMeta) {
							docRow.brand = cachedMeta.brand || docRow.brand || "";
							docRow.item_name = cachedMeta.item_name || currentItemCode;
						}
					}
				}
		
				// Add a fresh blank row and enter edit mode on it.
				const newName = `__new_row_${Date.now()}`;
				sourceDoc.items.push({
					doctype: childDoctype,
					name: newName,
					item_code: String(preset.item_code || ""),
					item_name: String(preset.item_name || preset.item_code || ""),
					qty: Number(preset.qty || 1) || 1,
					rate: Number(preset.rate || 0) || 0,
					amount: Number(preset.amount || 0) || 0,
					orc: 0,
					commission_type: "",
					rate_value: 0,
					status: sourceDoc.status || "",
					opportunity_type: String(preset.renewal_status || preset.opportunity_type || sourceDoc.renewal_status || sourceDoc.opportunity_type || ""),
					renewal_id: String(preset.renewal_id || ""),
					description: String(preset.description || ""),
					brand: String(preset.brand || ""),
					item_group: String(preset.item_group || ""),
					uom: String(preset.uom || ""),
					hsncode: String(preset.hsncode || ""),
				});
		
				this._currentOpportunityDoc = sourceDoc;
		
				if (persistImmediately && this._currentOpportunityName) {
					try {
						const saved = await frappe.call({
							method: "frappe.client.save",
							args: { doc: this.prepareDocForSave(sourceDoc) },
							freeze: true,
							freeze_message: __("Adding item..."),
						});
		
						if (saved?.message) {
							this._currentOpportunityDoc = saved.message;
						}
		
						await this.load_doc_details(this._currentOpportunityName);
						frappe.show_alert({ message: __("Item added"), indicator: "green" });
						return;
					} catch (e) {
						frappe.msgprint(__("Unable to add item. Please try again."));
					}
				}
		
				await this.renderOpportunityItems(sourceDoc);
				this.bindOpportunityItemRowActions();
				if (openInlineEditor) {
					this.enterOpportunityItemInlineEdit(newName, newIdx);
				}
			}
		
			async saveOpportunityItemInlineEdit($row) {
				const me = this;
				const docname = this._currentOpportunityName;
				if (!docname) return;
		
				$(".table-wrap").removeClass("is-inline-editing");
		
				const toNumber = (v) => {
					const n = parseFloat(v);
					return Number.isFinite(n) ? n : 0;
				};
		
				const toIntegerQty = (v) => {
					const raw = String(v ?? "").trim();
					if (!raw) return { valid: true, value: 0 };
					if (!/^\d+$/.test(raw)) return { valid: false, value: 0 };
					return { valid: true, value: parseInt(raw, 10) };
				};
		
				const rowName = ($row.attr("data-row-name") || "").trim();
				const rowIdx = parseInt($row.attr("data-row-idx"), 10);
				const getControlLiveValue = (ctrl, fallbackSelector = "") => {
					const controlValue = (ctrl && typeof ctrl.get_value === "function") ? String(ctrl.get_value() || "").trim() : "";
					if (controlValue) return controlValue;
					if (ctrl?.$input?.length) {
						const inputValue = String(ctrl.$input.val() || "").trim();
						if (inputValue) return inputValue;
					}
					if (fallbackSelector) {
						const domValue = String($row.find(fallbackSelector).val() || "").trim();
						if (domValue) return domValue;
					}
					return "";
				};
		
				const linkControl = $row.data("itemLinkControl");
				const item_code = getControlLiveValue(linkControl, ".item-code-link-control input, .item-edit-item-code");
				const item_name = String($row.find(".item-edit-item-name").val() || $row.find(".item-edit-item-name-preview").text() || item_code).trim();
				const qtyInfo = toIntegerQty($row.find(".item-edit-qty").val());
				if (!qtyInfo.valid || qtyInfo.value <= 0) {
					frappe.msgprint(__("Qty must be a whole number greater than 0."));
					return;
				}
				const qty = qtyInfo.value;
				const rate = toNumber($row.find(".item-edit-rate").val());
				const orc = $row.find(".item-edit-orc").is(":checked") ? 1 : 0;
				const commission_type = orc ? String($row.find(".item-edit-commission-type").val() || "").trim() : "";
				const rate_value = orc ? toNumber($row.find(".item-edit-rate-value").val()) : 0;
				const statusControl = $row.data("statusControl");
				const opportunityTypeControl = $row.data("opportunityTypeControl");
				const renewalIdControl = $row.data("renewalIdControl");
		
				const status = getControlLiveValue(statusControl, ".item-edit-status");
				const opportunity_type = getControlLiveValue(opportunityTypeControl, ".item-edit-opportunity-type");
				const renewal_id = getControlLiveValue(renewalIdControl, ".item-edit-renewal-id");
		
				const extraItemControls = $row.data("extraItemControls") || {};
		
				if (!item_code) {
					frappe.msgprint(__("Please set Item Code first."));
					return;
				}
		
				const latestDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, docname);
				let targetRow = latestDoc.items?.find((r) => r.name === rowName)
					|| (Number.isFinite(rowIdx) ? latestDoc.items?.[rowIdx] : null);
		
				if (!targetRow) {
					if (!Array.isArray(latestDoc.items)) latestDoc.items = [];
					targetRow = {
						doctype: latestDoc.items?.[0]?.doctype || this._currentOpportunityDoc?.items?.[0]?.doctype || "Opportunity Item",
					};
					latestDoc.items.push(targetRow);
				}
		
				const itemChildDoctype = String(
					targetRow.doctype
					|| latestDoc.items?.[0]?.doctype
					|| this._currentOpportunityDoc?.items?.[0]?.doctype
					|| "Opportunity Item"
				).trim();
				await frappe.model.with_doctype(itemChildDoctype);
				const itemChildMeta = frappe.get_meta(itemChildDoctype);
				const hasItemChildField = (fieldname) => Boolean(itemChildMeta?.fields?.some((df) => df.fieldname === fieldname));
		
				const itemMeta = $row.data("itemMeta") || await this.getItemAutofill(item_code);
		
				Object.assign(targetRow, {
					item_code,
					item_name,
					qty,
					rate,
					amount: qty * rate,
					orc,
					commission_type,
					rate_value,
					status,
					renewal_id,
				});
		
				Object.entries(extraItemControls).forEach(([fieldname, ctrl]) => {
					if (!fieldname || !ctrl) return;
					try {
						const value = (typeof ctrl.get_value === "function") ? ctrl.get_value() : undefined;
						if (typeof value !== "undefined") {
							targetRow[fieldname] = value;
						}
					} catch (e) {
						// ignore failed control reads
					}
				});
		
				// Persist Opportunity Type in whichever schema field is available.
				if (Object.prototype.hasOwnProperty.call(targetRow, "renewal_status")) {
					targetRow.renewal_status = opportunity_type;
				}
				if (Object.prototype.hasOwnProperty.call(targetRow, "opportunity_type")) {
					targetRow.opportunity_type = opportunity_type;
				}
				if (Object.prototype.hasOwnProperty.call(targetRow, "custom_opportunity_type")) {
					targetRow.custom_opportunity_type = opportunity_type;
				}
		
				if (itemMeta) {
					targetRow.item_name = itemMeta.item_name || targetRow.item_name || item_code;
					targetRow.description = itemMeta.description || targetRow.description || "";
					targetRow.item_group = itemMeta.item_group || targetRow.item_group || "";
					targetRow.brand = itemMeta.brand || targetRow.brand || "Others";
					targetRow.uom = itemMeta.uom || targetRow.uom || "";
					targetRow.stock_uom = itemMeta.uom || targetRow.stock_uom || "";
				}
		
				frappe.call({
					method: "frappe.client.save",
					args: { doc: this.prepareDocForSave(latestDoc) },
					freeze: true,
					freeze_message: __("Saving item..."),
					callback: (r) => {
						const savedDoc = r?.message;
						if (!savedDoc || savedDoc.doctype !== OPP_CFG.DOCTYPE) {
							frappe.msgprint({
								title: __("Error"),
								message: __("Failed to update item"),
								indicator: "red"
							});
							return;
						}
		
						const savedItems = Array.isArray(savedDoc.items) ? savedDoc.items : [];
						const savedRow = savedItems.find((row) => String(row?.name || "") === rowName)
							|| (Number.isFinite(rowIdx) ? savedItems[rowIdx] : null);
						if (savedRow) {
							console.log("DEBUG saveOpportunityItemInlineEdit - Saved buying fields:", {
								rowName,
								rowIdx,
								saved_buying_rate: savedRow.buying_rate,
								saved_purchase_rate: savedRow.purchase_rate,
								saved_buying_amount: savedRow.buying_amount,
								saved_purchase_amount: savedRow.purchase_amount,
								saved_detected_rate_values: (spqFieldCandidates?.rateFields || []).reduce((acc, key) => {
									acc[key] = savedRow?.[key];
									return acc;
								}, {}),
								saved_detected_amount_values: (spqFieldCandidates?.amountFields || []).reduce((acc, key) => {
									acc[key] = savedRow?.[key];
									return acc;
								}, {}),
								saved_row_keys: Object.keys(savedRow || {}),
							});
						}
		
						me._currentOpportunityDoc = savedDoc;
						$(me.page.wrapper).find("tr.item-inline-edit-row").remove();
						$(me.page.wrapper).find("#detail-items-inline-editor-panel").remove();
						$(".table-wrap").removeClass("is-inline-editing");
						frappe.show_alert({ message: __("Item updated"), indicator: "green" });
						me.load_doc_details(docname);
					},
					error: () => {
						frappe.msgprint({
							title: __("Error"),
							message: __("Failed to save item. Please try again."),
							indicator: "red"
						});
					}
				});
			}
		
		*/

		async addDetailItemRow(preset = {}, options = {}) {
			const persistImmediately = Boolean(options.persist);
			const sourceDoc = this._currentOpportunityDoc || {};
			if (!Array.isArray(sourceDoc.items)) sourceDoc.items = [];

			const childDoctype = sourceDoc.items?.[0]?.doctype || "Opportunity Item";
			const defaultCloseDate = sourceDoc[OPP_CFG.EXPECTED_CLOSE_FIELD] || sourceDoc.expected_closing || frappe.datetime.nowdate();
			const qty = Number(preset.qty || 1) || 1;
			const rate = Number(preset.rate || 0) || 0;
			const amount = Number(preset.amount || (qty * rate)) || (qty * rate);
			const newRow = {
				doctype: childDoctype,
				name: `__new_row_${Date.now()}`,
				item_code: String(preset.item_code || "").trim(),
				item_name: String(preset.item_name || preset.item_code || "").trim(),
				qty,
				rate,
				amount,
				brand: String(preset.brand || "").trim(),
				item_group: String(preset.item_group || "").trim(),
				description: String(preset.description || "").trim(),
				hsncode: String(preset.hsncode || "").trim(),
				uom: String(preset.uom || "").trim(),
				renewal_id: String(preset.renewal_id || "").trim(),
				opportunity_type: String(preset.renewal_status || preset.opportunity_type || sourceDoc.renewal_status || sourceDoc.opportunity_type || "New").trim() || "New",
				orc: Number(preset.orc || 0) ? 1 : 0,
				commission_type: String(preset.commission_type || "").trim(),
				rate_value: Number(preset.rate_value || 0) || 0,
			};

			sourceDoc.items.push(newRow);
			this._currentOpportunityDoc = sourceDoc;

			if (persistImmediately && this._currentOpportunityName) {
				const latestDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, this._currentOpportunityName).catch(() => null);
				if (!latestDoc) {
					frappe.msgprint(__("Unable to load the latest opportunity before adding the item."));
					return;
				}
				if (!Array.isArray(latestDoc.items)) latestDoc.items = [];
				latestDoc.items.push({ ...newRow, doctype: childDoctype, name: undefined });

				try {
					await frappe.call({
						method: "frappe.client.save",
						args: { doc: this.prepareDocForSave(latestDoc) },
						freeze: true,
						freeze_message: __("Adding item..."),
					});
					frappe.show_alert({ message: __("Item added"), indicator: "green" });
					await this.load_doc_details(this._currentOpportunityName);
					return;
				} catch (e) {
					frappe.msgprint(__("Unable to add item. Please try again."));
					return;
				}
			}

			await this.renderOpportunityItems(sourceDoc);
			this.bindOpportunityItemRowActions();
		}

		getOrCreateChartHoverTooltip() {
			let $tip = $("#opportunity-chart-hover-tooltip");
			if ($tip.length) return $tip;

			$("body").append(`
    <div id="opportunity-chart-hover-tooltip" style="position:fixed;z-index:1200;pointer-events:none;background:rgba(17,24,39,0.94);color:#fff;padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.35;display:none;max-width:260px;"></div>
  `);
			return $("#opportunity-chart-hover-tooltip");
		}

		showChartHoverTooltip(content, x, y) {
			const $tip = this.getOrCreateChartHoverTooltip();
			if (!$tip.length) return;
			$tip.html(content).css({ left: `${x + 12}px`, top: `${y + 12}px`, display: "block" });
		}

		hideChartHoverTooltip() {
			$("#opportunity-chart-hover-tooltip").hide();
		}

		bindBrandwisePieHover($pie, rows = [], total = 0) {
			if (!$pie?.length) return;

			$pie.off("mousemove.brandPie mouseleave.brandPie");
			this.hideChartHoverTooltip();

			const safeRows = (rows || []).filter((row) => Number(row.amount || 0) > 0);
			if (!safeRows.length || Number(total || 0) <= 0) return;

			let currentAngle = 0;
			const slices = safeRows.map((row) => {
				const amount = Number(row.amount || 0);
				const percentage = Number(row.percentage || ((amount / total) * 100));
				const angle = (percentage / 100) * 360;
				const slice = {
					brand: String(row.brand || "Others"),
					amount,
					percentage,
					start: currentAngle,
					end: currentAngle + angle,
				};
				currentAngle += angle;
				return slice;
			});

			$pie.on("mousemove.brandPie", (e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				const cx = rect.left + rect.width / 2;
				const cy = rect.top + rect.height / 2;
				const dx = e.clientX - cx;
				const dy = e.clientY - cy;
				const radius = Math.min(rect.width, rect.height) / 2;
				const distance = Math.sqrt((dx * dx) + (dy * dy));

				if (distance > radius) {
					this.hideChartHoverTooltip();
					return;
				}

				const angle = (Math.atan2(dy, dx) * (180 / Math.PI) + 450) % 360;
				const target = slices.find((slice) => angle >= slice.start && angle < slice.end) || slices[slices.length - 1];

				if (!target) {
					this.hideChartHoverTooltip();
					return;
				}

				const label = frappe.utils.escape_html(target.brand);
				const value = frappe.utils.escape_html(fmtCurrency(target.amount));
				const pct = Number(target.percentage || 0).toFixed(1);
				this.showChartHoverTooltip(`${label}<br>${value} (${pct}%)`, e.clientX, e.clientY);
			});

			$pie.on("mouseleave.brandPie", () => {
				this.hideChartHoverTooltip();
			});
		}

		renderBrandwiseChart(doc, analytics = null) {
			const items = doc.items || [];
			const $pie = $('#chart-brand-pie');
			const $legend = $('#chart-brand-data');

			const asNumber = (value) => {
				const parsed = parseFloat(value);
				return Number.isFinite(parsed) ? parsed : 0;
			};

			const hasBackendAnalytics = analytics && typeof analytics === "object";
			const backendRows = analytics?.brandwise?.rows || [];
			const backendTotal = Number(analytics?.brandwise?.total || 0);
			if (backendRows.length && backendTotal > 0) {
				const colors = ['#60a5fa', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];
				let currentAngle = 0;
				const gradientStops = backendRows.map((row, index) => {
					const value = Number(row.amount || 0);
					const percentage = backendTotal > 0 ? (value / backendTotal) * 100 : 0;
					const angle = (percentage / 100) * 360;
					const startAngle = currentAngle;
					const endAngle = currentAngle + angle;
					currentAngle = endAngle;
					return `${colors[index % colors.length]} ${startAngle}deg ${endAngle}deg`;
				}).join(', ');

				$pie.css('background', `conic-gradient(${gradientStops})`);

				$legend.empty();
				this.bindBrandwisePieHover($pie, backendRows, backendTotal);
				return;
			}

			// If backend analytics payload is present but has no rows, keep chart empty instead
			// of falling back to client-side approximation (which can look inconsistent).
			if (hasBackendAnalytics) {
				$pie.css('background', 'conic-gradient(#e5e7eb 0 360deg)');
				$legend.empty();
				this.bindBrandwisePieHover($pie, [], 0);
				return;
			}

			if (!items.length) {
				$pie.css('background', 'conic-gradient(#e5e7eb 0 360deg)');
				$legend.empty();
				this.bindBrandwisePieHover($pie, [], 0);
				return;
			}

			const isExcludedBrandStage = (stage) => {
				const value = String(stage || '').toLowerCase();
				if (!value) return false;
				return (
					value.includes('dead')
					|| value.includes('closed won')
					|| value.includes('closed lost')
					|| value.includes('won')
					|| value.includes('converted')
					|| value.includes('lost')
				);
			};

			const activeBrandItems = items.filter((item) => {
				const stage = item.status || doc.status || '';
				return !isExcludedBrandStage(stage);
			});

			if (!activeBrandItems.length) {
				$pie.css('background', 'conic-gradient(#e5e7eb 0 360deg)');
				$legend.empty();
				this.bindBrandwisePieHover($pie, [], 0);
				return;
			}

			const brandTotals = {};
			let grandTotal = 0;

			activeBrandItems.forEach((item) => {
				const brand = (item.brand || 'Others').trim() || 'Others';
				const qty = asNumber(item.qty);
				const rate = asNumber(item.rate);
				const amount = asNumber(item.amount) || (qty * rate);
				if (amount <= 0) return;

				brandTotals[brand] = (brandTotals[brand] || 0) + amount;
				grandTotal += amount;
			});

			const brandArray = Object.entries(brandTotals)
				.sort((left, right) => right[1] - left[1])
				.slice(0, 3);

			if (!brandArray.length || grandTotal <= 0) {
				$pie.css('background', 'conic-gradient(#e5e7eb 0 360deg)');
				$legend.empty();
				this.bindBrandwisePieHover($pie, [], 0);
				return;
			}

			const colors = ['#60a5fa', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];
			let currentAngle = 0;
			const gradientStops = brandArray.map(([brand, value], index) => {
				const percentage = (value / grandTotal) * 100;
				const angle = (percentage / 100) * 360;
				const startAngle = currentAngle;
				const endAngle = currentAngle + angle;
				currentAngle = endAngle;
				return `${colors[index % colors.length]} ${startAngle}deg ${endAngle}deg`;
			}).join(', ');

			$pie.css('background', `conic-gradient(${gradientStops})`);

			$legend.empty();
			const hoverRows = brandArray.map(([brand, amount]) => ({
				brand,
				amount,
				percentage: grandTotal > 0 ? ((amount / grandTotal) * 100) : 0,
			}));
			this.bindBrandwisePieHover($pie, hoverRows, grandTotal);
		}

		renderOpenWonLostChart(doc, analytics = null) {
			const $bars = $('#chart-stage-bars');
			const $legend = $('#chart-stage-data');
			if (!$bars.length || !$legend.length) return;

			const palette = ['#60a5fa', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316'];
			const stageMap = new Map();
			const backendRows = Array.isArray(analytics?.stage_amounts) ? analytics.stage_amounts : [];

			if (backendRows.length) {
				backendRows.forEach((row) => {
					const stage = String(row.stage || '').trim();
					const amount = Number(row.amount || 0);
					if (!stage || amount <= 0) return;
					stageMap.set(stage, (stageMap.get(stage) || 0) + amount);
				});
			} else {
				const items = Array.isArray(doc.items) ? doc.items : [];
				if (items.length) {
					items.forEach((item) => {
						const stage = String(item.status || doc.status || '').trim();
						const qty = Number(item.qty || 0);
						const rate = Number(item.rate || 0);
						const amount = Number(item.amount || 0) || (qty * rate);
						if (!stage || amount <= 0) return;
						stageMap.set(stage, (stageMap.get(stage) || 0) + amount);
					});
				}
			}

			const rows = Array.from(stageMap.entries()).map(([stage, amount], idx) => ({
				key: `stage_${idx + 1}`,
				label: stage,
				color: palette[idx % palette.length],
				amount: Number(amount || 0),
			}));

			if (backendRows.length) {
				const stageOrderMap = new Map(
					backendRows.map((row, idx) => [String(row?.stage || "").trim(), Number(row?.stage_idx ?? idx)])
				);
				rows.sort((a, b) => {
					const ai = stageOrderMap.has(a.label) ? Number(stageOrderMap.get(a.label)) : 9999;
					const bi = stageOrderMap.has(b.label) ? Number(stageOrderMap.get(b.label)) : 9999;
					if (ai !== bi) return ai - bi;
					return String(a.label || "").localeCompare(String(b.label || ""));
				});
			}

			const total = rows.reduce((sum, row) => sum + row.amount, 0);
			const activeRows = rows.filter((row) => row.amount > 0);
			if (!activeRows.length || total <= 0) {
				$bars.html('<div class="chart-empty">No stage amount data</div>');
				$legend.empty();
				return;
			}

			const compactCurrency = (value) => {
				const amount = Number(value || 0);
				if (!Number.isFinite(amount)) return "0";
				try {
					return new Intl.NumberFormat("en-IN", {
						notation: "compact",
						maximumFractionDigits: 1,
					}).format(amount);
				} catch (e) {
					return String(Math.round(amount));
				}
			};

			const minWidthPct = activeRows.length <= 2 ? 72 : (activeRows.length === 3 ? 62 : 50);
			const maxWidthPct = 100;
			const widthStep = activeRows.length > 1 ? ((maxWidthPct - minWidthPct) / (activeRows.length - 1)) : 0;

			const funnelRowsHtml = activeRows.map((row, idx) => {
				const widthPct = Math.max(maxWidthPct - (idx * widthStep), minWidthPct);
				const safeLabel = frappe.utils.escape_html(row.label);
				const safeAmountShort = frappe.utils.escape_html(compactCurrency(row.amount));
				const safeAmount = frappe.utils.escape_html(fmtCurrency(row.amount));
				const isLast = idx === (activeRows.length - 1);
				const shouldUseTail = activeRows.length >= 4;

				return `
        <div class="stage-funnel-row ${(isLast && shouldUseTail) ? "is-tail" : ""}" style="width:${widthPct}%; background:${row.color};" title="${safeLabel}: ${safeAmount}">
          <span class="stage-funnel-text">${safeLabel} ${safeAmountShort}</span>
          <div class="stage-funnel-gloss"></div>
          <div class="stage-funnel-edge"></div>
          <div class="stage-funnel-edge stage-funnel-edge--right"></div>
        </div>
      `;
			}).join('');

			$bars.html(`<div class="stage-funnel-wrap stage-funnel-wrap--pyramid">${funnelRowsHtml}</div>`);
			this.hideChartHoverTooltip();

			$legend.empty();
		}

		renderSalesProfitChart(doc, analytics = null) {
			const items = doc.items || [];
			const $bars = $('#chart-sales-bars');
			const $legend = $('#chart-sales-profit-data');
			if (!$bars.length || !$legend.length) return;

			const renderAmountRows = (sales, profit, supplier = 0, commission = 0) => {
				const safeSales = Number(sales || 0);
				const safeProfit = Number(profit || 0);
				const safeCost = Math.max(Number(supplier || 0) + Number(commission || 0), 0);

				const rows = [
					{ label: 'Closed Won Sales', amount: Math.max(safeSales, 0), color: '#5b8def' },

					{ label: 'Supplier + ORC', amount: safeCost, color: '#8b5cf6' },
					{ label: safeProfit >= 0 ? 'Profit' : 'Loss', amount: Math.abs(safeProfit), color: safeProfit >= 0 ? '#22c55e' : '#ef4444' },
				].filter((row) => row.amount > 0);

				if (!rows.length) {
					$bars.html('<div class="chart-empty">No amount data</div>');
					$legend.empty();
					return;
				}

				const maxAmount = Math.max(...rows.map((row) => row.amount), 1);
				const activeIndex = rows.reduce((bestIdx, row, idx) => (
					row.amount > rows[bestIdx].amount ? idx : bestIdx
				), 0);

				$bars.html(`
      <div class="sales-amount-list">
        ${rows.map((row, idx) => {
					const width = Math.max((row.amount / maxAmount) * 100, 4);
					const safeLabel = frappe.utils.escape_html(row.label);
					const safeAmount = frappe.utils.escape_html(fmtCurrency(row.amount));
					return `
            <div class="sales-amount-item ${idx === activeIndex ? 'is-active' : ''}" title="${safeLabel}: ${safeAmount}">
              <span class="sales-amount-dot" style="background:${row.color}"></span>
              <span class="sales-amount-name">${safeLabel}</span>
              <span class="sales-amount-pill">${safeAmount}</span>
              <div class="sales-amount-track">
                <div class="sales-amount-fill" style="width:${width}%;background:${row.color}"></div>
              </div>
            </div>
          `;
				}).join('')}
      </div>
    `);

				$legend.empty();
			};

			const backendSales = Number(analytics?.sales_profit?.sales || 0);
			const backendSupplier = Number(analytics?.sales_profit?.supplier || 0);
			const backendCommission = Number(analytics?.sales_profit?.commission || 0);
			const backendProfit = Number(analytics?.sales_profit?.profit || 0);
			if (analytics?.sales_profit && backendSales > 0) {
				renderAmountRows(backendSales, backendProfit, backendSupplier, backendCommission);
				return;
			}

			const asNumber = (value) => {
				const parsed = parseFloat(value);
				return Number.isFinite(parsed) ? parsed : 0;
			};

			if (!items.length) {
				$bars.html('<div class="chart-empty">No item data</div>');
				$legend.empty();
				return;
			}

			const isClosedWon = (stage) => {
				const value = String(stage || '').toLowerCase();
				return value.includes('won') || value.includes('converted') || value.includes('closed won');
			};

			const wonItems = items.filter((item) => {
				const stage = item.status || doc.status || '';
				return isClosedWon(stage);
			});

			if (!wonItems.length) {
				$bars.html('<div class="chart-empty">No closed-won data</div>');
				$legend.empty();
				return;
			}

			let totalSales = 0;
			let totalSupplier = 0;
			let totalCommission = 0;

			wonItems.forEach((item) => {
				const qty = asNumber(item.qty);
				const rate = asNumber(item.rate);
				const amount = asNumber(item.amount) || (qty * rate);
				if (amount <= 0) return;

				const supplierAmount = asNumber(item.supplier_amount)
					|| (asNumber(item.supplier_rate) * qty)
					|| (asNumber(item.cost) * qty)
					|| (asNumber(item.valuation_rate) * qty)
					|| 0;

				const commissionAmount = asNumber(item.orc_amount)
					|| asNumber(item.commission_amount)
					|| asNumber(item.commission)
					|| asNumber(item.orc)
					|| 0;

				totalSales += amount;
				totalSupplier += supplierAmount;
				totalCommission += commissionAmount;
			});

			if (totalSales <= 0) {
				$bars.html('<div class="chart-empty">No revenue data</div>');
				$legend.empty();
				return;
			}

			const profit = totalSales - totalSupplier - totalCommission;
			renderAmountRows(totalSales, profit, totalSupplier, totalCommission);
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

			this.getPageScope()
				.off("click", "#detail-pdf-btn")
				.on("click", "#detail-pdf-btn", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const docname = String(me._currentOpportunityName || name || "").trim();
					if (!docname) {
						frappe.msgprint(__("No quotation loaded"));
						return;
					}
					const pdfUrl = `/printview?doctype=${encodeURIComponent(OPP_CFG.DOCTYPE)}&name=${encodeURIComponent(docname)}&trigger_print=1`;
					window.open(pdfUrl, "_blank", "noopener,noreferrer");
				})
				.off("click", "#detail-edit-customer-btn")
				.on("click", "#detail-edit-customer-btn", async function (e) {
					e.preventDefault();
					e.stopPropagation();

					const docname = String(me._currentOpportunityName || name || "").trim();
					if (!docname) {
						frappe.msgprint(__("No quotation loaded"));
						return;
					}

					const currentDoc = me._currentOpportunityDoc || {};
					const currentCustomer = String(currentDoc.customer || currentDoc.customer || "").trim();

					frappe.prompt(
						[
							{
								label: "Customer",
								fieldname: "customer",
								fieldtype: "Link",
								options: "Customer",
								reqd: 1,
								default: currentCustomer,
							},
						],
						async (values) => {
							const selectedCustomer = String(values?.customer || "").trim();
							if (!selectedCustomer) return;
							if (selectedCustomer === currentCustomer) return;

							try {
								// Ensure doctype meta is loaded before using hasQuotationField
								if (!frappe.get_meta(OPP_CFG.DOCTYPE)) {
									await new Promise((resolve) =>
										frappe.model.with_doctype(OPP_CFG.DOCTYPE, resolve)
									);
								}
								const quotationMeta = frappe.get_meta(OPP_CFG.DOCTYPE);
								const hasQuotationField = (fieldname) => Boolean(
									quotationMeta?.fields?.some((df) => df.fieldname === fieldname)
								);

								// Fetch new customer's default address and contact
								let customerAddress = "";
								let shippingAddress = "";
								let contactPerson = "";

								try {
									const customerDoc = await frappe.db.get_doc("Customer", selectedCustomer);

									customerAddress = String(
										customerDoc?.customer_primary_address
										|| customerDoc?.primary_address
										|| customerDoc?.customer_address
										|| ""
									).trim();

									shippingAddress = String(
										customerDoc?.shipping_address_name
										|| customerDoc?.shipping_address
										|| ""
									).trim();

									contactPerson = String(
										customerDoc?.customer_primary_contact
										|| customerDoc?.primary_contact
										|| customerDoc?.default_contact
										|| ""
									).trim();

									// Always fetch all linked addresses and contacts via Dynamic Link
									const linkedRows = await frappe.db.get_list("Dynamic Link", {
										fields: ["parent", "parenttype"],
										filters: {
											link_doctype: "Customer",
											link_name: selectedCustomer,
											parenttype: ["in", ["Address", "Contact"]],
										},
										limit: 100,
									});

									const linkedAddresses = (Array.isArray(linkedRows) ? linkedRows : [])
										.filter((r) => String(r?.parenttype || "").trim() === "Address")
										.map((r) => String(r?.parent || "").trim())
										.filter(Boolean);

									const linkedContacts = (Array.isArray(linkedRows) ? linkedRows : [])
										.filter((r) => String(r?.parenttype || "").trim() === "Contact")
										.map((r) => String(r?.parent || "").trim())
										.filter(Boolean);

									if (!customerAddress && linkedAddresses.length) customerAddress = linkedAddresses[0];
									if (!shippingAddress) shippingAddress = linkedAddresses[1] || linkedAddresses[0] || "";
									if (!customerAddress && shippingAddress) customerAddress = shippingAddress;
									if (!shippingAddress && customerAddress) shippingAddress = customerAddress;
									if (!contactPerson && linkedContacts.length) contactPerson = linkedContacts[0];
								} catch (e) {
									console.warn("Unable to prefill address/contact for new customer:", e);
								}

								// Build the set_value payload
								const updateFields = { customer: selectedCustomer };
								if (customerAddress && hasQuotationField("customer_address")) {
									updateFields.customer_address = customerAddress;
								}
								if (shippingAddress) {
									if (hasQuotationField("shipping_address_name")) {
										updateFields.shipping_address_name = shippingAddress;
									}
									if (hasQuotationField("shipping_address")) {
										updateFields.shipping_address = shippingAddress;
									}
								}
								if (contactPerson && hasQuotationField("contact_person")) {
									updateFields.contact_person = contactPerson;
								}

								await frappe.call({
									method: "frappe.client.set_value",
									args: {
										doctype: OPP_CFG.DOCTYPE,
										name: docname,
										fieldname: updateFields,
									},
								});

								frappe.show_alert({ message: __("Customer updated"), indicator: "green" }, 4);
								await me.load_doc_details(docname);
							} catch (error) {
								frappe.msgprint(__("Unable to update customer. Ensure the field allows update after submit and try again."));
							}
						},
						__("Edit Customer"),
						__("Update")
					);
				})
				.off("click", "#detail-submit-btn")
				.on("click", "#detail-submit-btn", async function (e) {
					e.preventDefault();
					e.stopPropagation();

					const docname = String(me._currentOpportunityName || name || "").trim();
					if (!docname) {
						frappe.msgprint(__("No quotation loaded"));
						return;
					}

					const $btn = $(this);
					if ($btn.prop("disabled")) return;

					const latestDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, docname).catch(() => null);
					if (!latestDoc) {
						frappe.msgprint(__("Unable to load quotation for submit."));
						return;
					}

					if (Number(latestDoc.docstatus || 0) === 1) {
						frappe.show_alert({ message: __("Quotation is already submitted"), indicator: "orange" }, 4);
						return;
					}

					frappe.confirm(
						__("Do you want to submit this quotation?"),
						async () => {
							const originalLabel = $btn.text();
							$btn.prop("disabled", true).text("Submitting...");

							try {
								const submitRes = await frappe.call({
									method: "frappe.client.submit",
									args: { doc: latestDoc },
									freeze: true,
									freeze_message: __("Submitting quotation..."),
								});

								if (submitRes?.message) {
									me._currentOpportunityDoc = submitRes.message;
								}

								frappe.show_alert({ message: __("Quotation submitted"), indicator: "green" }, 4);
								await me.load_doc_details(docname);
							} catch (error) {
								frappe.msgprint(__("Unable to submit quotation. Please review mandatory fields and try again."));
								$btn.prop("disabled", false).text(originalLabel || "Submit");
							}
						}
					);
				});

			// Create dropdown actions
			$("#doc-actions-dropdown")
				.off("click", "a[data-action]")
				.on("click", "a[data-action]", async (e) => {
					e.preventDefault();
					const action = $(e.currentTarget).data("action");

					if (action === "create_customer_order_form") {
						if (Number(this._currentOpportunityDoc?.docstatus || 0) !== 1) {
							frappe.msgprint(__("Please submit this quotation before creating Customer Order Form."));
							return;
						}

						const quotationName = String(name || this._currentOpportunityName || "").trim();
						if (!quotationName) {
							frappe.msgprint(__("No quotation loaded."));
							return;
						}

						const sourceDoc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, quotationName)
							.catch(() => this._currentOpportunityDoc || null);

						if (!sourceDoc) {
							frappe.msgprint(__("Unable to load quotation for Customer Order Form creation."));
							return;
						}

						const itemRows = Array.isArray(sourceDoc.items) ? sourceDoc.items : [];
						const payloadItems = itemRows.map((row) => ({
							item_code: row.item_code,
							item_name: row.item_name,
							qty: row.qty,
							rate: row.rate,
							amount: row.amount,
							brand: row.brand,
							item_group: row.item_group,
							description: row.description,
							hsncode: row.hsncode || row.gst_hsn_code,
							uom: row.uom || row.stock_uom,
							opportunity_type: row.opportunity_type || row.custom_opportunity_type || "New",
							renewal_id: row.renewal_id,
							orc: row.orc,
							commission_type: row.commission_type,
							rate_value: row.rate_value,
							source_doctype: "Quotation",
							source_opportunity: quotationName,
							source_detail_name: row.name,
						}));

						// Fetch sales_team from opportunity if quotation doesn't have it
						let salesTeamData = Array.isArray(sourceDoc.sales_team) ? sourceDoc.sales_team : [];
						if (!salesTeamData.length && sourceDoc.opportunity) {
							try {
								const oppDoc = await frappe.db.get_doc("Opportunity", sourceDoc.opportunity);
								salesTeamData = Array.isArray(oppDoc.sales_team) ? oppDoc.sales_team : [];
							} catch (e) {
								console.warn("Failed to fetch sales_team from opportunity:", e);
							}
						}
						// Fetch sales_team from customer if still not found
						if (!salesTeamData.length && sourceDoc.customer) {
							try {
								const customerDoc = await frappe.db.get_doc("Customer", sourceDoc.customer);
								salesTeamData = Array.isArray(customerDoc.sales_team) ? customerDoc.sales_team : [];
							} catch (e) {
								console.warn("Failed to fetch sales_team from customer:", e);
							}
						}

						const pendingQuotationPayload = {
							source_doctype: "Quotation",
							opportunity: quotationName,
							customer: String(sourceDoc.customer || sourceDoc.customer || "").trim(),
							contact_person: String(sourceDoc.contact_person || sourceDoc.party_contact || sourceDoc.contact || "").trim(),
							transaction_date: sourceDoc.transaction_date,
							valid_till: sourceDoc.valid_till,
							owner: String(sourceDoc.owner || "").trim(),
							company: String(sourceDoc.company || "").trim(),
							customer_address: String(sourceDoc.customer_address || sourceDoc.billing_address_name || sourceDoc.billing_address || "").trim(),
							shipping_address_name: String(sourceDoc.shipping_address_name || sourceDoc.shipping_address || "").trim(),
							company_address: String(sourceDoc.company_address || sourceDoc.company_address_name || "").trim(),
							tax_category: String(sourceDoc.tax_category || "").trim(),
							taxes_and_charges: String(sourceDoc.taxes_and_charges || "").trim(),
							payment_terms_template: String(sourceDoc.payment_terms_template || "").trim(),
							grand_total: Number(sourceDoc.grand_total || 0) || 0,
							in_words: String(sourceDoc.in_words || "").trim(),
							rounded_total: Number(sourceDoc.rounded_total || 0) || 0,
							tc_name: String(sourceDoc.tc_name || "").trim(),
							contact_list: Array.isArray(sourceDoc.contact_list) ? sourceDoc.contact_list : [],
							sales_team: salesTeamData,
							selected_row_names: payloadItems.map((_, idx) => String(itemRows[idx]?.name || idx + 1)),
							items: payloadItems,
						};

						frappe._pendingQuotationFromOpportunity = pendingQuotationPayload;
						try {
							window.sessionStorage.setItem(
								"customer_order_forms_pending_from_opportunity",
								JSON.stringify(pendingQuotationPayload)
							);
						} catch (storageError) {
							// no-op
						}

						// frappe.route_options = {
						// 	quotation_id: quotationName,
						// };
						frappe.set_route("customer-order-forms", "new");
						return;
					}
				});
		}

		bind_followup_check(name) {
			const me = this;
			$("#followup-check-btn")
				.off("click")
				.on("click", async function (e) {
					e.preventDefault();
					const $btn = $(this);
					const originalLabel = $btn.text();
					$btn.prop("disabled", true).text("Checking...");

					try {
						await me.show_followup_summary(name);
					} finally {
						$btn.prop("disabled", false).text(originalLabel || "Follow Up");
					}
				});
		}

		async resolveAppointmentOpportunityField() {
			if (Object.prototype.hasOwnProperty.call(this, "_appointmentOpportunityField")) {
				return this._appointmentOpportunityField;
			}

			this._appointmentOpportunityField = "";
			try {
				await frappe.model.with_doctype("Appointment");
				const appointmentMeta = frappe.get_meta("Appointment");
				const hasField = (fieldname) => Boolean(
					appointmentMeta?.fields?.some((df) => df.fieldname === fieldname)
				);
				this._appointmentOpportunityField = ["custom_opportunity", "opportunity"].find(hasField) || "";
			} catch (e) {
				this._appointmentOpportunityField = "";
			}

			return this._appointmentOpportunityField;
		}

		async show_followup_summary(name) {
			const opportunityName = String(name || this._currentOpportunityName || "").trim();
			if (!opportunityName) {
				frappe.msgprint(__("Opportunity context is missing."));
				return;
			}

			const appointmentField = await this.resolveAppointmentOpportunityField();

			const callPromise = frappe.db.get_list("Call List", {
				fields: ["name", "subject", "status", "start_date", "start_timing", "modified"],
				filters: { custom_opportunity: opportunityName },
				limit: 5,
				order_by: "modified desc",
			}).catch(() => []);

			const appointmentPromise = appointmentField
				? frappe.db.get_list("Appointment", {
					fields: ["name", "customer_name", "party", "appointment_with", "scheduled_time", "custom_start_date", "custom_start_time", "modified"],
					filters: { [appointmentField]: opportunityName },
					limit: 5,
					order_by: "modified desc",
				}).catch(() => [])
				: Promise.resolve([]);

			const [calls, appointments] = await Promise.all([callPromise, appointmentPromise]);
			const callRows = Array.isArray(calls) ? calls : [];
			const appointmentRows = Array.isArray(appointments) ? appointments : [];

			const esc = (v) => frappe.utils.escape_html(String(v || ""));
			const total = callRows.length + appointmentRows.length;
			const summary = total > 0
				? `<div style="margin-bottom:8px;color:#166534;font-weight:600;">${__("Follow-up activities found")}: ${total}</div>`
				: `<div style="margin-bottom:8px;color:#92400e;font-weight:600;">${__("No follow-up activity found")}</div>`;

			const callHtml = callRows.length
				? `<div style="margin-top:8px;"><div style="font-weight:600;margin-bottom:4px;">${__("Recent Calls")}</div><ul style="margin:0;padding-left:18px;">${callRows.map((row) => {
					const label = esc(row.subject || row.name);
					const when = esc([row.start_date, row.start_timing].filter(Boolean).join(" ") || row.modified || "");
					return `<li><a href="/app/call-list/${esc(row.name)}" target="_blank" rel="noopener noreferrer">${label}</a>${when ? ` <span class="text-muted">(${when})</span>` : ""}</li>`;
				}).join("")}</ul></div>`
				: `<div style="margin-top:8px;"><span class="text-muted">${__("No calls linked to this opportunity")}</span></div>`;

			const appointmentHtml = appointmentRows.length
				? `<div style="margin-top:10px;"><div style="font-weight:600;margin-bottom:4px;">${__("Recent Appointments")}</div><ul style="margin:0;padding-left:18px;">${appointmentRows.map((row) => {
					const label = esc(row.customer_name || row.party || row.appointment_with || row.name);
					const when = esc(row.scheduled_time || [row.custom_start_date, row.custom_start_time].filter(Boolean).join(" ") || row.modified || "");
					return `<li><a href="/app/appointment/${esc(row.name)}" target="_blank" rel="noopener noreferrer">${label}</a>${when ? ` <span class="text-muted">(${when})</span>` : ""}</li>`;
				}).join("")}</ul></div>`
				: `<div style="margin-top:8px;"><span class="text-muted">${__("No appointments linked to this opportunity")}</span></div>`;

			frappe.msgprint({
				title: __("Follow Up Check"),
				message: `${summary}${callHtml}${appointmentHtml}`,
				indicator: total > 0 ? "green" : "orange",
				wide: true,
			});
		}

		async openQuotationItemSelector(name) {
			const sourceName = String(name || this._currentOpportunityName || "").trim();
			if (!sourceName) {
				frappe.msgprint(__("Quotation is not available"));
				return;
			}

			let doc = this._currentOpportunityDoc;
			if (!doc || doc.name !== sourceName) {
				try {
					doc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, sourceName);
				} catch (e) {
					frappe.msgprint(__("Unable to load opportunity items"));
					return;
				}
			}

			const items = Array.isArray(doc?.items) ? doc.items : [];
			if (!items.length) {
				frappe.msgprint(__("No items found in this opportunity"));
				return;
			}

			const normalizedItems = items
				.map((row) => ({
					name: String(row?.name || "").trim(),
					item_code: String(row?.item_code || "").trim(),
					item_name: String(row?.item_name || "").trim(),
					qty: parseFloat(String(row?.qty ?? "").replace(/,/g, "")) || 0,
					rate: parseFloat(String(row?.rate ?? "").replace(/,/g, "")) || 0,
					amount: parseFloat(String(row?.amount ?? "").replace(/,/g, "")) || 0,
				}))
				.filter((row) => row.name && row.item_code);

			if (!normalizedItems.length) {
				frappe.msgprint(__("No valid item rows found in this opportunity"));
				return;
			}

			const dialog = new frappe.ui.Dialog({
				title: __("Select Items for Customer Order Form"),
				size: "extra-large",
				fields: [
					{
						fieldname: "item_selector_html",
						fieldtype: "HTML",
					},
				],
				primary_action_label: __("Create Customer Order Form"),
				primary_action: () => {
					const selectedRowNames = new Set();
					const $wrapper = dialog.get_field("item_selector_html").$wrapper;
					$wrapper.find(".opp-quotation-item-check:checked").each(function () {
						const rowName = String($(this).data("row-name") || "").trim();
						if (rowName) selectedRowNames.add(rowName);
					});

					if (!selectedRowNames.size) {
						frappe.show_alert({ message: __("Please select at least one item"), indicator: "red" }, 4);
						return;
					}

					const selectedItems = (Array.isArray(doc?.items) ? doc.items : []).filter((row) =>
						selectedRowNames.has(String(row?.name || "").trim())
					);

					const sourceContactRows =
						(Array.isArray(doc?.contact_list) && doc.contact_list)
						|| (Array.isArray(doc?.contacts) && doc.contacts)
						|| (Array.isArray(doc?.party_contacts) && doc.party_contacts)
						|| [];

					const contactList = sourceContactRows
						.map((row) => {
							const contact = String(
								row?.contact
								|| row?.contact_person
								|| row?.contact_name
								|| row?.party_contact
								|| row?.name1
								|| row?.user_name
								|| ""
							).trim();
							if (!contact) return null;

							return {
								contact,
								full_name: String(row?.full_name || row?.contact_name || row?.person_name || "").trim(),
								phone: String(row?.mobile_no || row?.contact_mobile || row?.phone || row?.phone_no || "").trim(),
								email: String(row?.email_id || row?.contact_email || row?.email || "").trim(),
								designation: String(row?.designation || row?.desgination || "").trim(),
								tpoc: Number(row?.tpoc || row?.is_tpoc || row?.is_primary_contact || row?.is_primary || 0) === 1 ? 1 : 0,
							};
						})
						.filter(Boolean);

					const sourceTransactionDate = this.normalizeDateForDoc(doc?.transaction_date, frappe.datetime.nowdate());
					const sourceValidTill = this.normalizeDateForDoc(
						doc?.valid_till,
						frappe.datetime.add_days(sourceTransactionDate, 7)
					);

					const pendingQuotationPayload = {
						opportunity: sourceName,
						customer: String(doc?.customer || doc?.customer || "").trim(),
						contact_person: String(
							doc?.contact_person
							|| doc?.party_contact
							|| doc?.contact
							|| doc?.contact_name
							|| contactList?.[0]?.contact
							|| ""
						).trim(),
						transaction_date: sourceTransactionDate,
						valid_till: sourceValidTill,
						owner: String(doc?.owner || "").trim(),
						company: String(doc?.company || "").trim(),
						customer_address: String(
							doc?.customer_address
							|| doc?.customer_address_name
							|| doc?.billing_address_name
							|| doc?.billing_address
							|| ""
						).trim(),
						shipping_address_name: String(doc?.shipping_address_name || doc?.shipping_address || "").trim(),
						company_address: String(doc?.company_address || doc?.company_address_name || "").trim(),
						tax_category: String(doc?.tax_category || "").trim(),
						taxes_and_charges: String(doc?.taxes_and_charges || "").trim(),
						payment_terms_template: String(doc?.payment_terms_template || "").trim(),
						tc_name: String(doc?.tc_name || "").trim(),
						contact_list: contactList,
						sales_team: Array.isArray(doc?.sales_team) ? doc.sales_team : [],
						selected_row_names: Array.from(selectedRowNames),
						items: selectedItems,
					};

					frappe._pendingQuotationFromOpportunity = pendingQuotationPayload;
					try {
						window.sessionStorage.setItem(
							"customer_order_forms_pending_from_opportunity",
							JSON.stringify(pendingQuotationPayload)
						);
					} catch (e) {
						// no-op
					}

					dialog.hide();
					frappe.set_route("customer-order-forms", "new");
				},
			});

			// Inject scoped styles once
			if (!document.getElementById("opp-quotation-dialog-style")) {
				const style = document.createElement("style");
				style.id = "opp-quotation-dialog-style";
				style.textContent = `
				.opp-quot-dialog-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					margin-bottom: 14px;
					gap: 12px;
				}
				.opp-quot-dialog-hint {
					font-size: 13px;
					color: #6b7280;
					margin: 0;
				}
				.opp-quot-select-all-label {
					display: inline-flex;
					align-items: center;
					gap: 7px;
					font-size: 13px;
					font-weight: 500;
					color: #374151;
					cursor: pointer;
					white-space: nowrap;
				}
				.opp-quot-select-all-label input[type="checkbox"] {
					width: 15px;
					height: 15px;
					cursor: pointer;
					accent-color: #2563eb;
				}
				.opp-quot-table-wrap {
					border: 1px solid #e5e7eb;
					border-radius: 10px;
					overflow: hidden;
				}
				.opp-quot-table-scroll {
					max-height: 420px;
					overflow-y: auto;
					overflow-x: auto;
				}
				.opp-quot-table {
					width: 100%;
					border-collapse: collapse;
					font-size: 13px;
					min-width: 680px;
				}
				.opp-quot-table thead tr {
					background: #f3f4f6;
					border-bottom: 1px solid #e5e7eb;
				}
				.opp-quot-table thead th {
					padding: 10px 14px;
					font-weight: 600;
					color: #374151;
					text-align: left;
					white-space: nowrap;
				}
				.opp-quot-table thead th.text-right { text-align: right; }
				.opp-quot-table thead th.text-center { text-align: center; }
				.opp-quot-table tbody tr {
					border-bottom: 1px solid #f0f0f0;
					transition: background 0.12s;
				}
				.opp-quot-table tbody tr:last-child { border-bottom: none; }
				.opp-quot-table tbody tr:hover { background: #f9fafb; }
				.opp-quot-table tbody tr.is-checked { background: #eff6ff; }
				.opp-quot-table tbody td {
					padding: 10px 14px;
					color: #111827;
					vertical-align: middle;
				}
				.opp-quot-table tbody td.text-right { text-align: right; }
				.opp-quot-table tbody td.text-center { text-align: center; }
				.opp-quot-item-check {
					width: 15px;
					height: 15px;
					cursor: pointer;
					accent-color: #2563eb;
				}
				.opp-quot-item-name {
					font-weight: 500;
					color: #111827;
				}
				.opp-quot-item-code {
					color: #6b7280;
					font-size: 12px;
				}
				.opp-quot-table tbody td .opp-quot-item-name + .opp-quot-item-code {
					margin-top: 2px;
				}
				.opp-quot-footer-info {
					margin-top: 12px;
					font-size: 12px;
					color: #6b7280;
				}
				.modal-dialog.modal-extra-large .modal-body {
					padding: 20px 24px;
				}
			`;
				document.head.appendChild(style);
			}

			const rowsHtml = normalizedItems.map((row) => {
				const itemName = frappe.utils.escape_html(row.item_name || row.item_code);
				const itemCode = frappe.utils.escape_html(row.item_code || "-");
				const rowNameSafe = frappe.utils.escape_html(row.name);
				const qtyText = frappe.utils.escape_html(String(frappe.format(row.qty, { fieldtype: "Float" }) || "0"));
				const rateText = frappe.utils.escape_html(String(fmtCurrency(row.rate || 0) || "0"));
				const amountText = frappe.utils.escape_html(String(fmtCurrency(row.amount || (row.qty * row.rate)) || "0"));
				return `
				<tr class="is-checked">
					<td class="text-center">
						<input type="checkbox" class="opp-quot-item-check opp-quotation-item-check"
							data-row-name="${rowNameSafe}" checked />
					</td>
					<td>
						<div class="opp-quot-item-name">${itemName}</div>
						<div class="opp-quot-item-code">${itemCode}</div>
					</td>
					<td class="text-right">${qtyText}</td>
					<td class="text-right">${rateText}</td>
					<td class="text-right">${amountText}</td>
				</tr>
			`;
			}).join("");

			const html = `
			<div class="opp-quot-dialog-header">
				<p class="opp-quot-dialog-hint">${__("Select the items to include in the quotation.")}</p>
				<label class="opp-quot-select-all-label">
					<input type="checkbox" id="opp-quotation-select-all" checked />
					${__("Select All")}
				</label>
			</div>
			<div class="opp-quot-table-wrap">
				<div class="opp-quot-table-scroll">
					<table class="opp-quot-table">
						<thead>
							<tr>
								<th style="width:48px;" class="text-center">
									<i class="fa fa-check" style="color:#9ca3af;font-size:11px;"></i>
								</th>
								<th>${__("Item")}</th>
								<th class="text-right">${__("Qty")}</th>
								<th class="text-right">${__("Rate")}</th>
								<th class="text-right">${__("Amount")}</th>
							</tr>
						</thead>
						<tbody id="opp-quot-tbody">${rowsHtml}</tbody>
					</table>
				</div>
			</div>
			<div class="opp-quot-footer-info">
				${__("Total items")}: <strong>${normalizedItems.length}</strong>
			</div>
		`;

			dialog.get_field("item_selector_html").$wrapper.html(html);

			const $wrapper = dialog.get_field("item_selector_html").$wrapper;

			const updateSelectAllState = () => {
				const total = $wrapper.find(".opp-quotation-item-check").length;
				const checked = $wrapper.find(".opp-quotation-item-check:checked").length;
				$wrapper.find("#opp-quotation-select-all").prop("checked", total > 0 && checked === total);
				$wrapper.find(".opp-quot-footer-info").html(
					`${__("Selected")}: <strong>${checked}</strong> / ${total}`
				);
			};

			$wrapper.off("change", "#opp-quotation-select-all").on("change", "#opp-quotation-select-all", function () {
				const isChecked = $(this).is(":checked");
				$wrapper.find(".opp-quotation-item-check").prop("checked", isChecked);
				$wrapper.find(".opp-quot-table tbody tr").toggleClass("is-checked", isChecked);
				updateSelectAllState();
			});

			$wrapper.off("change", ".opp-quotation-item-check").on("change", ".opp-quotation-item-check", function () {
				$(this).closest("tr").toggleClass("is-checked", $(this).is(":checked"));
				updateSelectAllState();
			});

			dialog.show();
			updateSelectAllState();

			// Force modal to full usable width
			setTimeout(() => {
				$(dialog.$wrapper).find(".modal-dialog").css({
					"max-width": "min(92vw, 900px)",
					"width": "min(92vw, 900px)",
				});
			}, 0);
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
			const renderTimelineItems = (rows = []) => {
				const container = $("#activity-timeline");
				if (!container.length) return;

				if (!rows.length) {
					container.html(`
          <div class="timeline-empty">
            <i class="fa fa-inbox text-muted"></i>
            <p class="text-muted">No activity yet</p>
          </div>
        `);
					return;
				}

				const html = rows.map((c) => {
					const docLink = c.reference_doctype
						? `<a href="/app/${c.reference_doctype}/${c.reference_name}">${frappe.utils.escape_html(c.reference_name || "")}</a>`
						: "";
					const senderName = frappe.utils.escape_html(c.sender_full_name || c.sender || "System");
					const isEmail = (c.communication_type || "").toLowerCase() === "email";
					const isFeedback = !!(c.feedback_type || "");
					const icon = isEmail ? "envelope" : isFeedback ? "star" : "comment";
					const iconClass = isEmail ? "email" : "comment";

					const time = frappe.datetime.str_to_user(c.communication_date || c.creation || "");
					const subject = frappe.utils.escape_html(c.subject || "");
					const contentPreview = (c.content || "").substring(0, 140).replace(/<[^>]*>/g, "");

					return `
          <div class="timeline-item email-notification">
            <div class="timeline-item-icon ${iconClass}">
              <i class="fa fa-${icon}"></i>
            </div>
            <div class="timeline-item-content">
              <div class="timeline-item-meta">
                <span class="timeline-item-time">${time}</span>
                ${docLink ? `<span class="text-muted">•</span><span>${docLink}</span>` : ""}
              </div>
              ${subject ? `<div class="timeline-item-title">${subject}</div>` : ""}
              <div class="timeline-item-body">${contentPreview}${contentPreview.length > 130 ? "..." : ""}</div>
              <div class="text-muted mt-2" style="font-size: 11px;">By ${senderName}</div>
            </div>
          </div>
        `;
				}).join("");

				container.html(html);
			};

			// Users without Comment access can still view Communication entries.
			if (!canReadDoctype("Comment")) {
				frappe.db.get_list("Communication", {
					fields: [
						"name",
						"creation",
						"communication_date",
						"subject",
						"content",
						"sender",
						"sender_full_name",
						"reference_doctype",
						"reference_name",
						"communication_type",
						"feedback_type",
					],
					filters: {
						reference_doctype: OPP_CFG.DOCTYPE,
						reference_name: name,
					},
					limit: 20,
					order_by: "creation desc",
				}).then((rows) => {
					renderTimelineItems(Array.isArray(rows) ? rows : []);
				}).catch(() => {
					renderTimelineItems([]);
				});
				return;
			}

			// Load communications and activities
			frappe.call({
				method: "frappe.desk.form.load.get_communications",
				args: { doctype: OPP_CFG.DOCTYPE, name, start: 0, limit: 20 },
				callback: (r) => {
					const comms = (r.message && r.message.communication) || [];
					renderTimelineItems(comms);
				},
				error: () => {
					renderTimelineItems([]);
				},
			});
		}

		bind_comment_and_email(name) {
			const me = this;

			// Add comment button
			const $commentBtn = $("#add-comment-btn");
			const $commentInput = $("#new-comment-input");

			$commentBtn.off("click").on("click", async () => {
				let content = ($commentInput.html() || "").trim();
				content = await me.processAndAttachInlineImages(content, name);
				const plainText = (frappe.utils.strip_html ? frappe.utils.strip_html(content) : $("<div>").html(content).text()).trim();

				if (!plainText) {
					frappe.msgprint(__("Please enter a comment."));
					return;
				}

				frappe.call({
					method: "frappe.desk.form.utils.add_comment",
					args: {
						reference_doctype: OPP_CFG.DOCTYPE,
						reference_name: name,
						content: content,
						comment_email: frappe.session.user,
						comment_by: frappe.session.user_fullname
					},
					callback: () => {
						frappe.show_alert({ message: __("Comment added"), indicator: "green" });
						$commentInput.html("").focus();
						me.load_activity(name);
					},
					error: () => {
						frappe.show_alert({ message: __("Failed to add comment"), indicator: "red" });
					}
				});
			});

			// Allow Enter to submit (Ctrl+Enter or Cmd+Enter)
			$commentInput.off("keydown").on("keydown", (e) => {
				if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
					e.preventDefault();
					$commentBtn.click();
				}
			});

			// Email dialog
			const $emailBtn = $("#email-send");
			$emailBtn.off("click").on("click", async (e) => {
				e.preventDefault();

				const doc = await frappe.db.get_doc(OPP_CFG.DOCTYPE, name);
				const defaultEmail = doc.contact_email || "";

				const d = new frappe.ui.Dialog({
					title: __("Send Email"),
					fields: [
						{ label: __("To"), fieldname: "recipients", fieldtype: "Data", reqd: 1, default: defaultEmail },
						{ label: __("Subject"), fieldname: "subject", fieldtype: "Data", reqd: 1, default: doc[OPP_CFG.TITLE_FIELD] || doc.name },
						{ label: __("Message"), fieldname: "content", fieldtype: "Text Editor", reqd: 1 },
					],
					primary_action_label: __("Send"),
					primary_action: async (v) => {
						if (!v.recipients || !v.subject || !v.content) {
							frappe.msgprint(__("All fields are required"));
							return;
						}

						const processedContent = await me.processAndAttachInlineImages(v.content, name);

						d.hide();
						frappe.call({
							method: "frappe.core.doctype.communication.email.make",
							args: {
								doctype: OPP_CFG.DOCTYPE,
								name,
								recipients: v.recipients,
								subject: v.subject,
								content: processedContent,
								send_email: 1,
							},
							freeze: true,
							freeze_message: __("Sending email..."),
							callback: () => {
								frappe.show_alert({ message: __("Email sent"), indicator: "green" });
								me.load_activity(name);
								const activeTab = $(".panel__tabs .ptab.is-active").text().trim().replace(/^[^\w\s]+\s*/, "").trim();
								if (activeTab === "Email") {
									me.loadPanelCards("Email");
								}
							},
							error: () => frappe.msgprint(__("Failed to send email.")),
						});
					},
				});
				d.show();
			});
		}

		bindTabEvents() {
			const me = this;
			const getTypeFromTab = ($tab) => (($tab?.data("type") || "").toString().trim()
				|| ($tab?.text() || "").trim().replace(/^[^\w\s]+\s*/, "").trim());

			const $initialActiveTab = $(".panel__tabs .ptab.is-active").first();
			let activePanelType = getTypeFromTab($initialActiveTab) || "Call";
			const subtitleByType = {
				Call: "Recent Calls",
				Appointment: "Recent Appointments",
				Notes: "Notes",
				Email: "Recent Emails",
			};

			const applyPanelTypeUI = (type) => {
				$(".panel__header .panel__subtitle").text(subtitleByType[type] || `Recent ${type}`);
				$(".panel__form-title").text(type === "Notes" ? "New Note" : `New ${type}`);
				me.configurePanelFormByType(type);

				if (type === "Email") {
					$("#btn-panel-create").html('<i class="fa fa-envelope"></i> Send Email');
				} else if (type === "Notes") {
					$("#btn-panel-create").html('<i class="fa fa-plus"></i> New Note');
				} else {
					$("#btn-panel-create").html('<i class="fa fa-plus"></i> Create');
				}
			};

			// Show/hide form buttons
			$("#btn-panel-create").off("click").on("click", function () {
				if (activePanelType === "Email") {
					// For Email, trigger the email dialog
					$("#email-send").click();
				} else {
					me.showPanelForm(activePanelType);
				}
				setTimeout(() => me.updateLineItemsFullWidth(), 0);
				setTimeout(() => me.updateLineItemsFullWidth(), 120);
			});

			$("#btn-panel-close").off("click").on("click", function () {
				me.hidePanelForm();
				setTimeout(() => me.updateLineItemsFullWidth(), 0);
				setTimeout(() => me.updateLineItemsFullWidth(), 120);
			});

			// Right Panel tabs
			$(".panel__tabs .ptab").off("click").on("click", function () {
				$(".panel__tabs .ptab").removeClass("is-active");
				$(this).addClass("is-active");

				activePanelType = getTypeFromTab($(this)) || "Call";
				applyPanelTypeUI(activePanelType);

				// Hide form, show cards
				me.hidePanelForm();

				// Load cards for this type
				me.loadPanelCards(activePanelType);
				setTimeout(() => me.updateLineItemsFullWidth(), 0);
				setTimeout(() => me.updateLineItemsFullWidth(), 120);
			});

			// Load initial cards
			applyPanelTypeUI(activePanelType);
			this.hidePanelForm();
			this.loadPanelCards(activePanelType);

			// Save button in right panel
			$("#panel-save-btn").off("click").on("click", async function (e) {
				e.preventDefault();

				if (!me._currentOpportunityName) {
					frappe.msgprint(__("No quotation loaded"));
					return;
				}

				// Get form values
				const dateTime = $("#panel-datetime").val();
				const assignee = $("#panel-assignee").val();
				let notes = "";

				if (activePanelType === "Call") {
					const subject = ($("#panel-call-subject").val() || "").trim();
					const status = ($("#panel-call-status").val() || "").trim();
					const startDate = ($("#panel-call-start-date").val() || "").trim();
					const startTime = ($("#panel-call-start-time").val() || "").trim();
					const endDate = ($("#panel-call-end-date").val() || "").trim();
					const endTime = ($("#panel-call-end-time").val() || "").trim();
					const relatedTo = ($("#panel-call-related-to").val() || "").trim();
					const name1 = ($("#panel-call-name1").val() || "").trim();
					const description = ($("#panel-call-description").val() || "").trim();
					const salesTeam = ($("#panel-call-sales-team").val() || "").trim();

					if (!subject || !status || !startDate || !startTime || !endDate || !endTime || !relatedTo || !name1 || !salesTeam) {
						frappe.msgprint(__("Please fill all required Call fields"));
						return;
					}

					me.savePanelActivity(activePanelType, {
						opportunity: me._currentOpportunityName,
						subject,
						status,
						start_date: startDate,
						start_time: startTime,
						end_date: endDate,
						end_time: endTime,
						related_to: relatedTo,
						name1,
						description,
						sales_team: salesTeam,
					});
					return;
				}

				if (activePanelType === "Appointment") {
					const appointment_with = ($("#panel-appointment-with").val() || "").trim();
					const party = ($("#panel-party").val() || "").trim();
					const customer_name = ($("#panel-customer-name").val() || "").trim();
					const customer_phone_number = ($("#panel-customer-phone-number").val() || "").trim();
					const customer_email = ($("#panel-customer-email").val() || "").trim();
					const custom_participants_raw = me.getPanelParticipantValues();
					const custom_start_date = ($("#panel-custom-start-date").val() || "").trim();
					const custom_start_time = ($("#panel-custom-start-time").val() || "").trim();
					const custom_end_date = ($("#panel-custom-end-date").val() || "").trim();
					const custom_end_time = ($("#panel-custom-end-time").val() || "").trim();
					const customer_details = ($("#panel-customer-details").val() || "").trim();
					const scheduled_time = ($("#panel-scheduled-time").val() || "").trim();

					if (!appointment_with || !party || !customer_name || !customer_email || !custom_participants_raw.length || !custom_start_date || !custom_start_time || !custom_end_date || !custom_end_time || !scheduled_time) {
						frappe.msgprint(__("Please fill all required Appointment fields"));
						return;
					}

					me.savePanelActivity(activePanelType, {
						opportunity: me._currentOpportunityName,
						appointment_with,
						party,
						customer_name,
						customer_phone_number,
						customer_email,
						custom_participants: custom_participants_raw,
						custom_start_date,
						custom_start_time,
						custom_end_date,
						custom_end_time,
						custon_end_time: custom_end_time,
						customer_details,
						scheduled_time,
					});
					return;
				}

				if (activePanelType === "Notes") {
					const notesEditor = me.ensurePanelNotesEditor();
					notes = ((notesEditor && notesEditor.get_value && notesEditor.get_value()) || "").trim();
					notes = await me.processAndAttachInlineImages(notes, me._currentOpportunityName);
					const plainNote = (frappe.utils.strip_html ? frappe.utils.strip_html(notes) : $("<div>").html(notes).text()).trim();
					if (!plainNote) {
						frappe.msgprint(__("Please enter a note"));
						return;
					}
				} else {
					notes = $("#panel-notes").val().trim();
				}

				if (activePanelType !== "Notes" && (!dateTime || !assignee || !notes)) {
					frappe.msgprint(__("Please fill all fields"));
					return;
				}

				me.savePanelActivity(activePanelType, {
					datetime: dateTime,
					assignee: assignee,
					notes: notes,
					opportunity: me._currentOpportunityName
				});
			});

			// Quick search functionality
			$(".searchbox input").off("keyup").on("keyup", function (e) {
				const searchTerm = $(this).val().toLowerCase();

				if (e.key === "Enter" && searchTerm) {
					frappe.set_route("List", "Quotation", {
						"title": ["like", `%${searchTerm}%`]
					});
				}
			});
		}

		async processAndAttachInlineImages(htmlContent, opportunityName = "") {
			const html = this.sanitizeRichTextImages(String(htmlContent || ""));
			if (!html) return html;

			const docname = String(opportunityName || this._currentOpportunityName || "").trim();
			if (!docname) return html;

			const container = document.createElement("div");
			container.innerHTML = html;

			const images = Array.from(container.querySelectorAll("img[src]"));
			if (!images.length) return html;

			for (const image of images) {
				const src = (image.getAttribute("src") || "").trim();
				if (!src || !/^data:image\//i.test(src)) continue;

				const uploadedUrl = await this.uploadInlineImageToAttachment(src, docname);
				if (uploadedUrl) {
					image.setAttribute("src", uploadedUrl);
				}
			}

			return this.sanitizeRichTextImages(container.innerHTML);
		}

		normalizeRichTextContent(htmlContent) {
			const html = String(htmlContent || "").trim();
			if (!html) return "";

			const container = document.createElement("div");
			container.innerHTML = html;
			const qlRoot = container.querySelector(".ql-editor");
			if (qlRoot) {
				return this.sanitizeRichTextImages(qlRoot.innerHTML || "");
			}
			return this.sanitizeRichTextImages(html);
		}

		richTextToPlainText(htmlContent) {
			const normalized = this.normalizeRichTextContent(htmlContent);
			if (!normalized) return "";

			const container = document.createElement("div");
			container.innerHTML = normalized;

			Array.from(container.querySelectorAll("br")).forEach((node) => {
				node.replaceWith("\n");
			});

			Array.from(container.querySelectorAll("li")).forEach((node) => {
				const text = String(node.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
				node.replaceWith(text ? `\n• ${text}` : "");
			});

			Array.from(container.querySelectorAll("p, div, section, article, tr")).forEach((node) => {
				if (node.querySelector("li")) return;
				node.appendChild(document.createTextNode("\n"));
			});

			return String(container.textContent || "")
				.replace(/\u00a0/g, " ")
				.replace(/[ \t]+\n/g, "\n")
				.replace(/\n[ \t]+/g, "\n")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
		}

		richTextToDisplayText(htmlContent) {
			const plainText = this.richTextToPlainText(htmlContent);
			if (!plainText) return "";

			let formatted = String(plainText || "").trim();

			// Legacy item descriptions stored as one paragraph with " - " separators.
			if (!/\n/.test(formatted)) {
				const dashCount = (formatted.match(/\s-\s/g) || []).length;
				if (dashCount >= 2) {
					const firstDashIndex = formatted.indexOf(" - ");
					if (firstDashIndex > 0) {
						const leadText = formatted.slice(0, firstDashIndex).trim();
						const remainder = formatted.slice(firstDashIndex + 3);
						const listItems = remainder
							.split(/\s-\s/g)
							.map((item) => String(item || "").trim())
							.filter(Boolean);
						if (listItems.length >= 2) {
							formatted = `${leadText}\n- ${listItems.join("\n- ")}`;
						}
					}
				}
			}

			return formatted
				.replace(/\s+(Domain:)/gi, "\n$1")
				.replace(/\s+(License Period:)/gi, "\n$1")
				.replace(/\s+(Note:)/gi, "\n$1")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
		}

		sanitizeRichTextImages(htmlContent) {
			const html = String(htmlContent || "");
			if (!html) return "";

			const container = document.createElement("div");
			container.innerHTML = html;

			Array.from(container.querySelectorAll("img")).forEach((img) => {
				const src = String(img.getAttribute("src") || "").trim();
				const badSrc = !src
					|| src === "null"
					|| src === "undefined"
					|| src === "about:blank";
				if (badSrc || /^data:image\//i.test(src)) {
					img.remove();
				}
			});

			return container.innerHTML;
		}

		ensurePanelNotesEditor() {
			if (this._panelNotesEditor) {
				return this._panelNotesEditor;
			}

			const $editorHost = $("#panel-notes-editor");
			if (!$editorHost.length || !frappe?.ui?.form?.make_control) {
				return null;
			}

			this._panelNotesEditor = frappe.ui.form.make_control({
				parent: $editorHost,
				df: {
					fieldtype: "Text Editor",
					fieldname: "panel_notes_editor",
					label: "",
				},
				render_input: true,
			});

			return this._panelNotesEditor;
		}

		async ensurePanelParticipantUsers() {
			const $host = $("#panel-custom-participants-control");
			if (!$host.length) return;

			if (!this._panelParticipantUsersLoaded) {
				this._panelParticipantUsersLoaded = true;
				this._panelParticipantUsers = [];

				try {
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.customer_order_forms.customer_order_forms.get_enabled_users",
					});
					this._panelParticipantUsers = Array.isArray(res?.message) ? res.message : [];
				} catch (e) {
					this._panelParticipantUsers = [];
				}
			}

			const selected = this.getPanelParticipantValues();
			const options = (this._panelParticipantUsers || []).map((user) => {
				const value = String(user?.user_id || user?.email || "").trim();
				const label = String(user?.name || user?.email || value).trim();
				if (!value) return null;
				return {
					label,
					value,
					description: user?.email || value,
				};
			}).filter(Boolean);

			if (!this._panelParticipantsControl && frappe?.ui?.form?.make_control) {
				$host.empty();
				this._panelParticipantsControl = frappe.ui.form.make_control({
					parent: $host,
					df: {
						fieldtype: "MultiSelect",
						fieldname: "panel_custom_participants",
						label: "",
						options,
					},
					render_input: true,
				});
			}

			if (this._panelParticipantsControl) {
				this._panelParticipantsControl.df.options = options;
				if (this._panelParticipantsControl.refresh) {
					this._panelParticipantsControl.refresh();
				}
				this.setPanelParticipantValues(selected);
			}
		}

		getPanelParticipantValues() {
			const control = this._panelParticipantsControl;
			if (!control || typeof control.get_value !== "function") {
				return [];
			}

			const raw = control.get_value();
			if (Array.isArray(raw)) {
				return raw.map((value) => String(value || "").trim()).filter(Boolean);
			}

			return String(raw || "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
		}

		setPanelParticipantValues(values = []) {
			const control = this._panelParticipantsControl;
			if (!control || typeof control.set_value !== "function") {
				return;
			}

			const normalized = (Array.isArray(values) ? values : [values])
				.map((value) => String(value || "").trim())
				.filter(Boolean);

			try {
				control.set_value(normalized);
			} catch (e) {
				control.set_value(normalized.join(", "));
			}
		}

		configurePanelFormByType(type) {
			const isCall = type === "Call";
			const isAppointment = type === "Appointment";
			const isNotes = type === "Notes";
			const $formSection = $("#panel-form-section");
			const $callFields = $("#panel-call-fields");
			const $appointmentFields = $("#panel-appointment-fields");
			const $dateField = $("#panel-datetime").closest(".panel__field");
			const $assigneeField = $("#panel-assignee").closest(".panel__field");
			const $notesField = $("#panel-notes").closest(".panel__field");
			const $notesTextarea = $("#panel-notes");
			const $notesEditorWrap = $("#panel-notes-editor-wrap");

			if (isCall) {
				$formSection.removeClass("panel--appointment-mode").addClass("panel--call-mode");
				$callFields.removeClass("d-none");
				$appointmentFields.addClass("d-none");
				$dateField.addClass("d-none");
				$assigneeField.addClass("d-none");
				$notesField.addClass("d-none");
				$notesEditorWrap.addClass("d-none");
				$notesTextarea.addClass("d-none");
				$("#panel-save-btn").text("Save Call");
			} else if (isAppointment) {
				$formSection.removeClass("panel--call-mode").addClass("panel--appointment-mode");
				$callFields.addClass("d-none");
				$appointmentFields.removeClass("d-none");
				$dateField.addClass("d-none");
				$assigneeField.addClass("d-none");
				$notesField.addClass("d-none");
				$notesEditorWrap.addClass("d-none");
				$notesTextarea.addClass("d-none");
				$("#panel-save-btn").text("Schedule Appointment");
			} else if (isNotes) {
				$formSection.removeClass("panel--appointment-mode panel--call-mode");
				$callFields.addClass("d-none");
				$appointmentFields.addClass("d-none");
				$dateField.addClass("d-none");
				$assigneeField.addClass("d-none");
				$notesField.removeClass("d-none");
				$notesField.find("label").text("Note");
				$notesTextarea.addClass("d-none");
				$notesEditorWrap.removeClass("d-none");
				this.ensurePanelNotesEditor();
				$("#panel-save-btn").text("Save Note");
			} else {
				$formSection.removeClass("panel--appointment-mode panel--call-mode");
				$callFields.addClass("d-none");
				$appointmentFields.addClass("d-none");
				$dateField.removeClass("d-none");
				$assigneeField.removeClass("d-none");
				$notesField.removeClass("d-none");
				$notesField.find("label").text("Notes");
				$notesEditorWrap.addClass("d-none");
				$notesTextarea.removeClass("d-none").attr("placeholder", "Notes").attr("rows", 8);
				$("#panel-save-btn").text("Save");
			}
		}

		showPanelForm(type) {
			$("#panel-cards-section").addClass("d-none");
			$("#panel-form-section").removeClass("d-none");
			$("#btn-panel-create").hide();
			$(".panel__header").hide();
			this.configurePanelFormByType(type);
			this.initPanelDefaults();
			if (type === "Appointment") {
				this.ensurePanelParticipantUsers();
			}
			this.updateLineItemsFullWidth();
		}

		hidePanelForm() {
			$("#panel-form-section").addClass("d-none").removeClass("panel--appointment-mode panel--call-mode");
			$("#panel-cards-section").removeClass("d-none");
			$("#btn-panel-create").show();
			$(".panel__header").show();
			this.clearPanelForm();
			this.updateLineItemsFullWidth();
		}

		renderPanelEmptyState($container, title, description = "") {
			const safeTitle = frappe.utils.escape_html(title || "No records");
			const safeDescription = frappe.utils.escape_html(description || "");
			$container.html(`
    <div class="empty-state">
      <i class="fa fa-phone"></i>
      <p class="empty-state__title">${safeTitle}</p>
      ${safeDescription ? `<p class="empty-state__desc">${safeDescription}</p>` : ""}
    </div>
  `);
		}

		renderPanelLoadingState($container, label = "Loading...") {
			const safeLabel = frappe.utils.escape_html(label || "Loading...");
			$container.html(`<div class="chart-empty">${safeLabel}</div>`);
		}

		loadPanelCards(type) {
			const me = this;
			const $container = $("#panel-cards-section");

			if (!me._currentOpportunityName) {
				me.renderPanelEmptyState($container, `No ${type.toLowerCase()}s`, "Create one from the panel to get started.");
				return;
			}

			let doctype = "";
			let filters = {};
			let fields = ["name", "creation", "modified"];

			if (type === "Call") {
				me.renderPanelLoadingState($container, "Loading calls...");

				const requestedFields = [
					"name",
					"creation",
					"modified",
					"subject",
					"status",
					"custom_sales_person",
					"custom_opportunity",
					"start_date",
					"start_timing",
					"end_date",
					"end_timing",
					"related_to",
					"name1",
					"description",
				];

				frappe.db.get_list("Call List", {
					fields: requestedFields,
					filters: {
						custom_opportunity: me._currentOpportunityName,
					},
					limit: 20,
					order_by: "modified desc",
				}).then((rows) => {
					const groups = [Array.isArray(rows) ? rows : []];
					const map = new Map();
					(groups || []).flat().forEach((row) => {
						if (row?.name && !map.has(row.name)) {
							map.set(row.name, row);
						}
					});

					const calls = Array.from(map.values()).sort((a, b) => {
						const at = new Date(a.modified || a.creation || 0).getTime();
						const bt = new Date(b.modified || b.creation || 0).getTime();
						return bt - at;
					});

					if (!calls.length) {
						me.renderPanelEmptyState($container, "No calls", "Recent call activities will appear here.");
						return;
					}

					me.renderPanelCards(calls.slice(0, 20), "Call", "Call List");
					setTimeout(() => me.updateLineItemsFullWidth(), 0);
					setTimeout(() => me.updateLineItemsFullWidth(), 120);
				}).catch(() => {
					me.renderPanelEmptyState($container, "Failed to load", "Try refreshing this page.");
				});
				return;
			} else if (type === "Appointment") {
				me.renderPanelLoadingState($container, "Loading appointments...");

				const requestedFields = [
					"name",
					"creation",
					"modified",
					"appointment_with",
					"party",
					"customer_name",
					"scheduled_time",
					"custom_start_date",
					"custom_start_time",
					"custom_end_date",
					"custom_end_time",
				];

				const opportunityName = String(me._currentOpportunityName || "").trim();
				const customerName = String(me._currentPartyName || "").trim();

				const resolveOpportunityLinkField = async () => {
					try {
						await frappe.model.with_doctype("Appointment");
						const appointmentMeta = frappe.get_meta("Appointment");
						const hasField = (fieldname) => Boolean(
							appointmentMeta?.fields?.some((df) => df.fieldname === fieldname)
						);
						return ["custom_opportunity", "opportunity"].find(hasField) || "";
					} catch (e) {
						return "";
					}
				};

				resolveOpportunityLinkField().then((opportunityFieldname) => {
					if (!opportunityFieldname) {
						me.renderPanelEmptyState(
							$container,
							"No appointments",
							"Appointment doctype has no Opportunity link field. Add custom_opportunity/opportunity to isolate records per opportunity."
						);
						return;
					}

					if (!opportunityName) {
						me.renderPanelEmptyState($container, "No appointments", "Opportunity context is missing.");
						return;
					}

					frappe.db.get_list("Appointment", {
						fields: requestedFields,
						filters: {
							[opportunityFieldname]: opportunityName,
						},
						limit: 20,
						order_by: "modified desc",
					}).then((rows) => {
						const groups = [Array.isArray(rows) ? rows : []];
						const map = new Map();
						(groups || []).flat().forEach((row) => {
							if (row?.name && !map.has(row.name)) {
								map.set(row.name, row);
							}
						});

						let appointments = Array.from(map.values()).sort((a, b) => {
							const at = new Date(a.modified || a.creation || 0).getTime();
							const bt = new Date(b.modified || b.creation || 0).getTime();
							return bt - at;
						});

						if (!appointments.length) {
							me.renderPanelEmptyState($container, "No appointments", "Recent appointment activities will appear here.");
							return;
						}

						me.renderPanelCards(appointments.slice(0, 20), "Appointment", "Appointment");
						setTimeout(() => me.updateLineItemsFullWidth(), 0);
						setTimeout(() => me.updateLineItemsFullWidth(), 120);
					}).catch(() => {
						if (customerName) {
							me.renderPanelEmptyState(
								$container,
								"No appointments",
								"Could not load opportunity-linked appointments."
							);
							return;
						}
						me.renderPanelEmptyState($container, "No appointments", "No customer is set on this opportunity.");
					});
				}).catch(() => {
					me.renderPanelEmptyState($container, "Failed to load", "Try refreshing this page.");
				});
				return;
			} else if (type === "Notes") {
				me.renderPanelLoadingState($container, "Loading notes...");

				const crmNotePromise = frappe.db.get_doc(OPP_CFG.DOCTYPE, me._currentOpportunityName)
					.then((doc) => Array.isArray(doc?.notes) ? doc.notes : [])
					.catch(() => []);

				const commentPromise = canReadDoctype("Comment")
					? frappe.db.get_list("Comment", {
						fields: ["name", "creation", "content", "owner", "comment_type"],
						filters: {
							reference_doctype: OPP_CFG.DOCTYPE,
							reference_name: me._currentOpportunityName,
							comment_type: "Comment",
						},
						limit: 20,
						order_by: "creation desc",
					}).catch(() => [])
					: Promise.resolve([]);

				Promise.all([crmNotePromise, commentPromise]).then(([crmRows, commentRows]) => {
					const crmNotes = (crmRows || []).map((row) => ({
						name: row.name,
						creation: row.added_on || row.creation,
						content: row.note || "",
						owner: row.added_by || row.owner || "",
						owner_full_name: row.added_by || row.owner || "",
						_note_doctype: "CRM Note",
						_note_parent: me._currentOpportunityName,
					}));

					const comments = (commentRows || []).map((row) => ({
						name: row.name,
						creation: row.creation,
						content: row.content || "",
						owner: row.owner || "",
						owner_full_name: row.owner || "",
						_note_doctype: "Comment",
					}));

					const map = new Map();
					[...crmNotes, ...comments].forEach((row) => {
						const key = `${row._note_doctype}:${row.name}`;
						if (!map.has(key)) {
							map.set(key, row);
						}
					});

					const merged = Array.from(map.values()).sort((a, b) => {
						const at = new Date(a.creation || 0).getTime();
						const bt = new Date(b.creation || 0).getTime();
						return bt - at;
					});

					if (!merged.length) {
						me.renderPanelEmptyState($container, "No notes", "Recent notes will show up here.");
						return;
					}

					me.renderPanelCards(merged.slice(0, 20), "Notes", "Mixed");
					setTimeout(() => me.updateLineItemsFullWidth(), 0);
					setTimeout(() => me.updateLineItemsFullWidth(), 120);
				}).catch(() => {
					me.renderPanelEmptyState($container, "Failed to load", "Try refreshing this page.");
				});
				return;
			} else if (type === "Email") {
				me.renderPanelLoadingState($container, "Loading emails...");

				frappe.db.get_list("Communication", {
					fields: [
						"name",
						"creation",
						"communication_date",
						"subject",
						"content",
						"sender",
						"recipients",
						"communication_type",
						"communication_medium",
						"sent_or_received",
					],
					filters: {
						reference_doctype: OPP_CFG.DOCTYPE,
						reference_name: me._currentOpportunityName,
						communication_medium: "Email",
					},
					limit: 20,
					order_by: "creation desc",
				}).then((emails) => {
					if (emails && emails.length) {
						me.renderPanelCards(emails, "Email", "Communication");
						setTimeout(() => me.updateLineItemsFullWidth(), 0);
						setTimeout(() => me.updateLineItemsFullWidth(), 120);
						return;
					}

					frappe.call({
						method: "frappe.desk.form.load.get_communications",
						args: {
							doctype: OPP_CFG.DOCTYPE,
							name: me._currentOpportunityName,
							start: 0,
							limit: 20,
						},
						callback: (r) => {
							const comms = ((r.message && r.message.communication) || []).filter((c) => {
								const referenceDoctype = String(c.reference_doctype || "").trim();
								const referenceName = String(c.reference_name || "").trim();
								const communicationType = (c.communication_type || "").toLowerCase();
								const communicationMedium = (c.communication_medium || "").toLowerCase();
								const direction = (c.sent_or_received || "").toLowerCase();
								const isSameOpportunity = referenceDoctype === OPP_CFG.DOCTYPE
									&& referenceName === String(me._currentOpportunityName || "").trim();
								return isSameOpportunity && (
									communicationType === "email"
									|| communicationMedium === "email"
									|| direction === "sent"
									|| direction === "received"
								);
							});

							if (!comms.length) {
								me.renderPanelEmptyState($container, "No emails", "Email activities will appear here.");
								return;
							}

							me.renderPanelCards(comms, "Email", "Communication");
							setTimeout(() => me.updateLineItemsFullWidth(), 0);
							setTimeout(() => me.updateLineItemsFullWidth(), 120);
						},
						error: () => {
							me.renderPanelEmptyState($container, "Failed to load", "Try refreshing this page.");
						},
					});
				}).catch(() => {
					me.renderPanelEmptyState($container, "Failed to load", "Try refreshing this page.");
				});
				return;
			}

			if (!doctype) {
				me.renderPanelEmptyState($container, `No ${type.toLowerCase()}s`);
				return;
			}

			me.renderPanelLoadingState($container, "Loading activities...");

			frappe.db.get_list(doctype, {
				fields: fields,
				filters: filters,
				limit: 10,
				order_by: "modified desc"
			}).then(items => {
				if (!items || items.length === 0) {
					me.renderPanelEmptyState($container, `No ${type.toLowerCase()}s`, "Recent activities will show up here.");
					return;
				}

				me.renderPanelCards(items, type, doctype);
				setTimeout(() => me.updateLineItemsFullWidth(), 0);
				setTimeout(() => me.updateLineItemsFullWidth(), 120);
			}).catch(() => {
				me.renderPanelEmptyState($container, "Failed to load", "Try refreshing this page.");
				setTimeout(() => me.updateLineItemsFullWidth(), 0);
			});
		}

		renderPanelCards(items, type, doctype) {
			const $container = $("#panel-cards-section");

			if (type === "Notes") {
				const html = items.map((item) => {
					const owner = frappe.utils.escape_html(item.owner_full_name || item.owner || "User");
					const rawContent = this.normalizeRichTextContent((item.content || "").trim());
					const content = rawContent
						? (frappe.dom?.remove_script_and_style ? frappe.dom.remove_script_and_style(rawContent) : frappe.utils.escape_html(rawContent).replace(/\n/g, "<br>"))
						: "-";
					const date = item.creation ? frappe.datetime.str_to_user(item.creation) : "";
					const initial = frappe.utils.escape_html((item.owner || "U").charAt(0).toUpperCase());
					const noteDoctype = frappe.utils.escape_html(item._note_doctype || "Comment");
					const noteParent = frappe.utils.escape_html(item._note_parent || this._currentOpportunityName || "");

					return `
        <div class="note-row" data-note-name="${frappe.utils.escape_html(item.name)}" data-note-doctype="${noteDoctype}" data-note-parent="${noteParent}">
          <div class="note-avatar">${initial}</div>
          <div class="note-main">
            <div class="note-meta">
              <span class="note-owner">${owner}</span>
              <span class="note-date">${frappe.utils.escape_html(date)}</span>
            </div>
            <div class="note-content">${content}</div>
          </div>
          <div class="note-actions">
            <button class="note-action-btn note-edit" data-note-name="${frappe.utils.escape_html(item.name)}" data-note-doctype="${noteDoctype}" data-note-parent="${noteParent}" title="Edit Note"><i class="fa fa-pencil"></i></button>
            <button class="note-action-btn note-delete" data-note-name="${frappe.utils.escape_html(item.name)}" data-note-doctype="${noteDoctype}" data-note-parent="${noteParent}" title="Delete Note"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      `;
				}).join("");

				$container.html(html);
				this.bindNoteCardActions();
				return;
			}

			const html = items.map(item => {
				let title = "";
				let body = "";
				let date = "";
				let meta = "";
				let link = "";

				if (type === "Call") {
					title = item.subject || item.name || "Call";
					body = item.description || "No description";
					const startText = [item.start_date, item.start_timing].filter(Boolean).join(" ");
					const endText = [item.end_date, item.end_timing].filter(Boolean).join(" ");
					date = startText ? frappe.datetime.str_to_user(startText) : "";
					const endDateText = endText ? frappe.datetime.str_to_user(endText) : "";
					const salesPerson = (item.custom_sales_person || "").trim();

					const statusLabel = String(item.status || "").trim();
					const statusClassMap = {
						scheduled: "is-scheduled",
						held: "is-held",
						cancelled: "is-cancelled",
						"not responding": "is-not-responding",
					};
					const statusClass = statusClassMap[statusLabel.toLowerCase()] || "is-default";

					const callRows = [];
					callRows.push(`
        <div class="call-card-row call-card-row--title">
          <div class="panel-card-title">${frappe.utils.escape_html(title)}</div>
          ${statusLabel ? `<span class="call-status-pill ${statusClass}">${frappe.utils.escape_html(statusLabel)}</span>` : ""}
        </div>
      `);

					if (date || endDateText) {
						callRows.push(`
          <div class="call-card-row call-card-row--time">
            <span class="call-meta-item"><i class="fa fa-clock-o"></i> ${frappe.utils.escape_html(date || "-")}${endDateText ? ` - ${frappe.utils.escape_html(endDateText)}` : ""}</span>
          </div>
        `);
					}

					if (salesPerson) {
						callRows.push(`
          <div class="call-card-row call-card-row--sales">
            <span class="call-meta-item"><i class="fa fa-user"></i> ${frappe.utils.escape_html(salesPerson)}</span>
          </div>
        `);
					}

					callRows.push(`
        <div class="call-card-row call-card-row--desc panel-card-body">${frappe.utils.escape_html(body)}</div>
      `);

					meta = callRows.join("");
					link = `/app/call-list/${item.name}`;
				} else if (type === "Appointment") {
					title = item.subject || item.customer_name || item.party || "Appointment";
					body = item.description || item.appointment_with || "No description";
					const appointmentDate = item.scheduled_time || item.custom_start_date || item.creation || "";
					date = appointmentDate ? frappe.datetime.str_to_user(appointmentDate) : "";
					meta = "";
					link = `/app/appointment/${item.name}`;
				} else if (type === "Email") {
					title = item.subject || "Email";
					body = (item.content || "").replace(/<[^>]*>/g, "").substring(0, 100);
					date = item.communication_date ? frappe.datetime.str_to_user(item.communication_date) : "";
					meta = item.sender ? `<i class="fa fa-envelope"></i> ${frappe.utils.escape_html(item.sender)}` : "";
					link = "#";
				}

				return `
      <div class="panel-card" onclick="window.open('${link}', '_blank')">
        ${type === "Call"
						? `<div class="panel-card-meta panel-card-meta--call">${meta}</div>`
						: `
            <div class="panel-card-header">
              <div class="panel-card-title">${frappe.utils.escape_html(title)}</div>
              <div class="panel-card-date">${frappe.utils.escape_html(date)}</div>
            </div>
            <div class="panel-card-body">${frappe.utils.escape_html(body)}</div>
            ${meta ? `<div class="panel-card-meta">${meta}</div>` : ""}
          `
					}
      </div>
    `;
			}).join("");

			$container.html(html);
		}

		bindNoteCardActions() {
			const me = this;
			const $container = $("#panel-cards-section");

			$container.find(".note-edit").off("click").on("click", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const noteName = $(this).data("note-name");
				const noteDoctype = ($(this).data("note-doctype") || "Comment").toString();
				const noteParent = ($(this).data("note-parent") || me._currentOpportunityName || "").toString();
				if (!noteName) return;

				const loadDocPromise = noteDoctype === "CRM Note"
					? frappe.db.get_doc(OPP_CFG.DOCTYPE, noteParent || me._currentOpportunityName).then((parentDoc) => {
						const row = (parentDoc.notes || []).find((n) => n.name === noteName);
						return row || {};
					})
					: frappe.db.get_doc(noteDoctype, noteName);

				loadDocPromise.then((doc) => {
					const dialog = new frappe.ui.Dialog({
						title: __("Edit Note"),
						fields: [
							{
								fieldname: "note_content",
								fieldtype: "Text Editor",
								label: __("Note"),
								reqd: 1,
								default: me.normalizeRichTextContent((noteDoctype === "CRM Note" ? doc.note : doc.content) || ""),
							},
						],
						primary_action_label: __("Save"),
						primary_action: async (values) => {
							let noteContent = (values?.note_content || "").trim();
							noteContent = await me.processAndAttachInlineImages(noteContent, me._currentOpportunityName);
							const plain = (frappe.utils.strip_html ? frappe.utils.strip_html(noteContent) : $("<div>").html(noteContent).text()).trim();
							if (!plain) {
								frappe.msgprint(__("Please enter a note"));
								return;
							}

							if (noteDoctype === "CRM Note") {
								me.updateOpportunityCrmNote(noteName, noteContent, noteParent || me._currentOpportunityName)
									.then(() => {
										dialog.hide();
										frappe.show_alert({ message: __("Note updated"), indicator: "green" });
										me.loadPanelCards("Notes");
										if (me._currentOpportunityName) {
											me.load_activity(me._currentOpportunityName);
										}
									})
									.catch(() => {
										frappe.msgprint(__("Failed to update note. Please try again."));
									});
								return;
							}

							frappe.call({
								method: "frappe.client.set_value",
								args: {
									doctype: noteDoctype,
									name: noteName,
									fieldname: "content",
									value: noteContent,
								},
								callback: () => {
									dialog.hide();
									frappe.show_alert({ message: __("Note updated"), indicator: "green" });
									me.loadPanelCards("Notes");
									if (me._currentOpportunityName) {
										me.load_activity(me._currentOpportunityName);
									}
								},
							});
						},
					});

					dialog.show();
				});
			});

			$container.find(".note-delete").off("click").on("click", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const noteName = $(this).data("note-name");
				const noteDoctype = ($(this).data("note-doctype") || "Comment").toString();
				const noteParent = ($(this).data("note-parent") || me._currentOpportunityName || "").toString();
				if (!noteName) return;

				frappe.confirm(__("Delete this note?"), () => {
					if (noteDoctype === "CRM Note") {
						me.deleteOpportunityCrmNote(noteName, noteParent || me._currentOpportunityName)
							.then(() => {
								frappe.show_alert({ message: __("Note deleted"), indicator: "green" });
								me.loadPanelCards("Notes");
								if (me._currentOpportunityName) {
									me.load_activity(me._currentOpportunityName);
								}
							})
							.catch(() => {
								frappe.msgprint(__("Failed to delete note. Please try again."));
							});
						return;
					}

					frappe.call({
						method: "frappe.client.delete",
						args: {
							doctype: noteDoctype,
							name: noteName,
						},
						callback: () => {
							frappe.show_alert({ message: __("Note deleted"), indicator: "green" });
							me.loadPanelCards("Notes");
							if (me._currentOpportunityName) {
								me.load_activity(me._currentOpportunityName);
							}
						},
					});
				});
			});
		}

		savePanelActivity(type, data) {
			const me = this;

			const normalizeDateTimeInput = (value) => {
				const raw = String(value || "").trim();
				if (!raw) return "";

				if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
					return `${raw.replace("T", " ")}:00`;
				}

				if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
					return raw.includes("T") ? raw.replace("T", " ") : (raw.length === 16 ? `${raw}:00` : raw);
				}

				return raw;
			};

			if (type === "Email") {
				// For Email, use the existing email dialog from comments section
				frappe.msgprint(__("Please use the 'New Email' button in the Comments section to send emails"));
				return;
			}

			if (type === "Call") {
				const primaryDate = (data.start_date || frappe.datetime.nowdate() || "").trim();
				const opportunityName = (data.opportunity || me._currentOpportunityName || "").trim();
				const salesPerson = (data.sales_team || "").trim();
				const callDoc = {
					doctype: "Call List",
					subject: data.subject,
					status: data.status,
					date: primaryDate,
					custom_date: primaryDate,
					custom_opportunity: opportunityName,
					custom_sales_person: salesPerson,
					start_date: data.start_date,
					start_timing: data.start_time,
					end_date: data.end_date,
					end_timing: data.end_time,
					related_to: data.related_to,
					name1: data.name1,
					description: data.description || "",
					direction: "Outbound",
				};

				if (salesPerson) {
					callDoc.sales_team = [
						{
							doctype: "Sales Team",
							sales_person: salesPerson,
							allocated_percentage: 100,
						},
					];
				}

				frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: callDoc,
					},
					callback: (r) => {
						if (r.message) {
							frappe.show_alert({ message: __("Call scheduled successfully"), indicator: "green" });
							me.hidePanelForm();
							me.loadPanelCards(type);
							me.load_activity(data.opportunity);
						}
					},
					error: () => {
						frappe.msgprint(__("Failed to create call. Please try again."));
					}
				});
			} else if (type === "Appointment") {
				const participants = (() => {
					const raw = Array.isArray(data.custom_participants)
						? data.custom_participants
						: String(data.custom_participants || "")
							.split(",")
							.map((value) => value.trim())
							.filter(Boolean);
					return raw.map((user) => ({ user }));
				})();

				const appointmentDoc = {
					doctype: "Appointment",
					appointment_with: data.appointment_with,
					party: data.party,
					customer_name: data.customer_name,
					customer_phone_number: data.customer_phone_number,
					customer_email: data.customer_email,
					custom_participants: participants,
					custom_start_date: data.custom_start_date,
					custom_start_time: data.custom_start_time,
					custom_end_date: data.custom_end_date,
					custom_end_time: data.custom_end_time,
					custon_end_time: data.custon_end_time,
					customer_details: data.customer_details,
					scheduled_time: normalizeDateTimeInput(data.scheduled_time),
				};

				const insertAppointment = (doc) => {
					frappe.call({
						method: "frappe.client.insert",
						args: {
							doc,
						},
						callback: (r) => {
							if (r.message) {
								frappe.show_alert({ message: __("Appointment scheduled successfully"), indicator: "green" });
								me.hidePanelForm();
								me.loadPanelCards(type);
								me.load_activity(data.opportunity);
							}
						},
						error: () => {
							frappe.msgprint(__("Failed to create appointment. Please try again."));
						}
					});
				};

				const opportunityName = String(data.opportunity || me._currentOpportunityName || "").trim();

				frappe.model.with_doctype("Appointment").then(() => {
					const appointmentMeta = frappe.get_meta("Appointment");
					const hasField = (fieldname) => Boolean(
						appointmentMeta?.fields?.some((df) => df.fieldname === fieldname)
					);

					if (opportunityName) {
						if (hasField("custom_opportunity")) {
							appointmentDoc.custom_opportunity = opportunityName;
						} else if (hasField("opportunity")) {
							appointmentDoc.opportunity = opportunityName;
						}
					}

					insertAppointment(appointmentDoc);
				}).catch(() => {
					insertAppointment(appointmentDoc);
				});
			} else if (type === "Notes") {
				this.createOpportunityCrmNote(data.opportunity, data.notes)
					.then(() => {
						frappe.show_alert({ message: __("Note created successfully"), indicator: "green" });
						me.hidePanelForm();
						me.loadPanelCards(type);
						me.load_activity(data.opportunity);
					})
					.catch(() => {
						frappe.msgprint(__("Failed to create note. Please try again."));
					});
			}
		}

		createOpportunityCrmNote(opportunityName, noteHtml) {
			return frappe.db.get_doc(OPP_CFG.DOCTYPE, opportunityName).then((doc) => {
				doc.notes = Array.isArray(doc.notes) ? doc.notes : [];
				doc.notes.push({
					doctype: "CRM Note",
					note: noteHtml,
					added_by: frappe.session.user_fullname || frappe.session.user,
					added_on: frappe.datetime.now_datetime(),
				});
				return frappe.call({
					method: "frappe.client.save",
					args: { doc: this.prepareDocForSave(doc) },
				});
			});
		}

		updateOpportunityCrmNote(noteName, noteHtml, opportunityName) {
			return frappe.db.get_doc(OPP_CFG.DOCTYPE, opportunityName).then((doc) => {
				const rows = Array.isArray(doc.notes) ? doc.notes : [];
				const row = rows.find((entry) => entry.name === noteName);
				if (!row) {
					throw new Error("CRM Note row not found");
				}
				row.note = noteHtml;
				return frappe.call({
					method: "frappe.client.save",
					args: { doc: this.prepareDocForSave(doc) },
				});
			});
		}

		deleteOpportunityCrmNote(noteName, opportunityName) {
			return frappe.db.get_doc(OPP_CFG.DOCTYPE, opportunityName).then((doc) => {
				const rows = Array.isArray(doc.notes) ? doc.notes : [];
				doc.notes = rows.filter((entry) => entry.name !== noteName);
				return frappe.call({
					method: "frappe.client.save",
					args: { doc: this.prepareDocForSave(doc) },
				});
			});
		}

		clearPanelForm() {
			$("#panel-call-subject").val("");
			$("#panel-call-status").val("Scheduled");
			$("#panel-call-start-date").val("");
			$("#panel-call-start-time").val("");
			$("#panel-call-end-date").val("");
			$("#panel-call-end-time").val("");
			$("#panel-call-related-to").val("");
			$("#panel-call-name1").val("");
			$("#panel-call-description").val("");
			$("#panel-call-sales-team").val("");

			$("#panel-datetime").val("");
			$("#panel-assignee").val("");
			$("#panel-notes").val("");

			$("#panel-appointment-with").val("Customer");
			$("#panel-party").val("");
			$("#panel-customer-name").val("");
			$("#panel-customer-phone-number").val("");
			$("#panel-customer-email").val("");
			this.setPanelParticipantValues([]);
			$("#panel-custom-start-date").val("");
			$("#panel-custom-start-time").val("");
			$("#panel-custom-end-date").val("");
			$("#panel-custom-end-time").val("");
			$("#panel-customer-details").val("");
			$("#panel-scheduled-time").val("");

			if (this._panelNotesEditor && this._panelNotesEditor.set_value) {
				this._panelNotesEditor.set_value("");
			}
		}

		initPanelDefaults() {
			const now = new Date();
			const end = new Date(now.getTime() + (30 * 60 * 1000));

			const fmtDate = (dt) => {
				const year = dt.getFullYear();
				const month = String(dt.getMonth() + 1).padStart(2, "0");
				const day = String(dt.getDate()).padStart(2, "0");
				return `${year}-${month}-${day}`;
			};

			const fmtTime = (dt) => {
				const hours = String(dt.getHours()).padStart(2, "0");
				const minutes = String(dt.getMinutes()).padStart(2, "0");
				return `${hours}:${minutes}`;
			};

			const opportunityTitle = (this._currentOpportunityDoc?.[OPP_CFG.TITLE_FIELD] || this._currentOpportunityName || "").trim();
			const relatedTo = this._currentContactId ? "Contact" : (this._currentPartyName ? "Customer" : "");
			const relatedName = relatedTo === "Contact" ? this._currentContactId : (this._currentPartyName || "");
			const defaultSalesPerson = (this._currentSalesTeamSummary?.[0]?.sales_person || "").trim();
			const defaultCustomerName = (this._currentPartyName || "").trim();
			const defaultCustomerEmail = (
				this._currentOpportunityDoc?.contact_email
				|| this._currentOpportunityDoc?.email_id
				|| this._currentOpportunityDoc?.customer_email
				|| ""
			).trim();
			const defaultCustomerPhone = (
				this._currentOpportunityDoc?.contact_mobile
				|| this._currentOpportunityDoc?.mobile_no
				|| this._currentOpportunityDoc?.phone
				|| ""
			).trim();

			$("#panel-call-subject").val(opportunityTitle ? `Call: ${opportunityTitle}` : "");
			$("#panel-call-status").val("Scheduled");
			$("#panel-call-start-date").val(fmtDate(now));
			$("#panel-call-start-time").val(fmtTime(now));
			$("#panel-call-end-date").val(fmtDate(end));
			$("#panel-call-end-time").val(fmtTime(end));
			$("#panel-call-related-to").val(relatedTo);
			$("#panel-call-name1").val(relatedName);
			$("#panel-call-sales-team").val(defaultSalesPerson);

			// Set default assignee to current user
			$("#panel-assignee").val(frappe.session.user);

			// Set default datetime to current time
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
			$("#panel-datetime").val(datetimeLocal);

			const endYear = end.getFullYear();
			const endMonth = String(end.getMonth() + 1).padStart(2, '0');
			const endDay = String(end.getDate()).padStart(2, '0');
			const endHours = String(end.getHours()).padStart(2, '0');
			const endMinutes = String(end.getMinutes()).padStart(2, '0');
			const endDatetimeLocal = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`;

			$("#panel-appointment-with").val("Customer");
			$("#panel-party").val(defaultCustomerName);
			$("#panel-customer-name").val(defaultCustomerName);
			$("#panel-customer-phone-number").val(defaultCustomerPhone);
			$("#panel-customer-email").val(defaultCustomerEmail);
			this.ensurePanelParticipantUsers().then(() => {
				const currentUser = (frappe.session.user || "").trim();
				const availableValues = new Set(
					(this._panelParticipantUsers || []).map((user) => String(user?.user_id || user?.email || "").trim()).filter(Boolean)
				);

				if (currentUser && availableValues.has(currentUser)) {
					this.setPanelParticipantValues([currentUser]);
				} else {
					this.setPanelParticipantValues([]);
				}
			});
			$("#panel-custom-start-date").val(fmtDate(now));
			$("#panel-custom-start-time").val(fmtTime(now));
			$("#panel-custom-end-date").val(fmtDate(end));
			$("#panel-custom-end-time").val(fmtTime(end));
			$("#panel-scheduled-time").val(datetimeLocal);
			$("#panel-customer-details").val("");
		}


		bind_connections_button(name) {
			const me = this;
			$("#connections-btn")
				.off("click")
				.on("click", async function (e) {
					e.preventDefault();
					const $btn = $(this);
					const originalLabel = $btn.text();
					$btn.prop("disabled", true).text("Loading...");
					try {
						await me.show_connections_popup(name);
					} finally {
						$btn.prop("disabled", false).text(originalLabel || "Connections");
					}
				});
		}

		async doctype_has_field(doctype, fieldname) {
			this._doctypeFieldCache = this._doctypeFieldCache || {};
			const key = `${doctype}::${fieldname}`;
			if (Object.prototype.hasOwnProperty.call(this._doctypeFieldCache, key)) {
				return Boolean(this._doctypeFieldCache[key]);
			}

			let hasField = false;
			try {
				await frappe.model.with_doctype(doctype);
				const meta = frappe.get_meta(doctype);
				hasField = Boolean(meta?.fields?.some((df) => df.fieldname === fieldname));
			} catch (e) {
				hasField = false;
			}

			this._doctypeFieldCache[key] = hasField;
			return hasField;
		}

		async get_doctype_count(doctype, filters = {}) {
			try {
				const r = await frappe.call({
					method: "frappe.client.get_count",
					args: { doctype, filters },
				});
				return Number(r?.message || 0) || 0;
			} catch (e) {
				try {
					const rows = await frappe.db.get_list(doctype, {
						fields: ["name"],
						filters,
						limit: 1000,
					});
					return Array.isArray(rows) ? rows.length : 0;
				} catch (e2) {
					return 0;
				}
			}
		}

		async count_by_candidate_fields(doctype, candidates = [], value = "") {
			const lookupValue = String(value || "").trim();
			if (!lookupValue) return { count: 0, fieldUsed: "" };

			for (const fieldname of candidates) {
				if (!fieldname) continue;
				const hasField = await this.doctype_has_field(doctype, fieldname);
				if (!hasField) continue;

				const filters = { [fieldname]: lookupValue };
				if (fieldname === "prevdoc_docname" && await this.doctype_has_field(doctype, "prevdoc_doctype")) {
					filters.prevdoc_doctype = OPP_CFG.DOCTYPE;
				}

				const count = await this.get_doctype_count(doctype, filters);
				if (count > 0) {
					return { count, fieldUsed: fieldname };
				}
			}

			return { count: 0, fieldUsed: "" };
		}

		async get_connections_summary(name) {
			const opportunityName = String(name || this._currentOpportunityName || "").trim();
			if (!opportunityName) return [];

			const doc = this._currentOpportunityDoc || {};
			const customerName = String(doc.customer || doc.customer || "").trim();

			const defs = [

				{
					key: "supplier_quotation",
					label: "Supplier Quotation",
					doctype: "Supplier Quotation",
					value: opportunityName,
					fields: ["cof_id", "source_opportunity", "against_opportunity", "prevdoc_docname"],
				},
				{
					key: "sales_order",
					label: "Sales Order",
					doctype: "Sales Order",
					value: opportunityName,
					fields: ["cof_id"],
				},
				{
					key: "orc_list",
					label: "ORC List",
					doctype: "ORC List",
					value: opportunityName,
					fields: ["cof_id"],
				},
			];

			const out = [];
			for (const def of defs) {
				if (!canReadDoctype(def.doctype)) continue;
				const result = await this.count_by_candidate_fields(def.doctype, def.fields, def.value);
				if (!def.value) {
					out.push({ ...def, count: 0, fieldUsed: "" });
					continue;
				}
				out.push({ ...def, count: Number(result.count || 0), fieldUsed: result.fieldUsed || "" });
			}
			return out;
		}


		open_connection_list(entry = {}) {
			const doctype = String(entry?.doctype || "").trim();
			if (!doctype) return;

			const fieldUsed = String(entry?.fieldUsed || "").trim();
			const value = String(entry?.value || "").trim();
			const key = String(entry?.key || "").trim();

			// Quotation — always navigate with opportunity filter
			if (key === "supplier_quotation") {
				const filterField = fieldUsed || "cof_id";
				const filters = JSON.stringify([["Supplier Quotation", filterField, "=", value, false]]);
				window.location.href = `/app/supplier-quotations?filters=${encodeURIComponent(filters)}`;
				return;
			}

			// Supplier Quotation — always navigate with opportunity filter
			if (key === "sales_order") {
				//const filterField = fieldUsed || "cof_id";
				//const filters = JSON.stringify([["Sales Order", filterField, "=", value, false]]);
				window.location.href = `/app/sales-order/view/list?cof_id=${encodeURIComponent(value)}`;
				return;
			}

			// ORC List — always navigate with cof_id filter
			if (key === "orc_list") {
				window.location.href = `/app/orc-list/view/list?cof_id=${encodeURIComponent(value)}`;
				return;
			}

			if (!doctype) return;

			if (fieldUsed && value) {
				frappe.set_route("List", doctype, { [fieldUsed]: ["=", value] });
				return;
			}

			frappe.set_route("List", doctype);
		}

		create_connection_doc(entry = {}, opportunityName = "") {
			const key = String(entry?.key || "").trim();
			const name = String(opportunityName || this._currentOpportunityName || "").trim();
			const doc = this._currentOpportunityDoc || {};
			const customerName = String(doc.customer || doc.customer || "").trim();

			if (key === "sales_order") {
				//this.openQuotationItemSelector(name);
				frappe.new_doc("Sales Order", { cof_id: name });
				return;
			}
			if (key === "supplier_quotation") {
				//this.openQuotationItemSelector(name, "supplier_quotation");
				frappe.new_doc("Supplier Quotation", { cof_id: name });
				return;
			}
			if (key === "orc_list") {
				frappe.new_doc("ORC List", { cof_id: name });
				return;
			}

			const fallbackDoctype = String(entry?.doctype || "").trim();
			if (fallbackDoctype) {
				frappe.new_doc(fallbackDoctype);
			}
		}

		async show_connections_popup(name) {
			const me = this;
			const opportunityName = String(name || this._currentOpportunityName || "").trim();
			if (!opportunityName) {
				frappe.msgprint(__("Opportunity context is missing."));
				return;
			}

			const rows = await this.get_connections_summary(opportunityName);
			const esc = (v) => frappe.utils.escape_html(String(v || ""));
			const host = this.getRightPanelPersonCardHost();
			if (!host) return;

			const { $panel, $card } = host;
			const isConnectionsOpen = !$card.hasClass("d-none") && this._rightPanelCardType === "connections";
			if (!isConnectionsOpen || !this._rightPanelPrevState) {
				this._rightPanelPrevState = {
					tabsHidden: $panel.find(".panel__tabs").hasClass("d-none"),
					headerHidden: $panel.find(".panel__header").hasClass("d-none"),
					cardsHidden: $panel.find("#panel-cards-section").hasClass("d-none"),
					formHidden: $panel.find("#panel-form-section").hasClass("d-none"),
				};
			}

			const totalCount = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
			const isSubmitted = Number((this._currentOpportunityDoc || {}).docstatus) === 1;
			const html = rows.length
				? rows.map((row) => {
					const showCreate = row.key === "sales_order" && isSubmitted;
					return `
				<div class="opp-conn-row" data-conn-key="${esc(row.key)}" data-conn-doctype="${esc(row.doctype)}" data-conn-field="${esc(row.fieldUsed)}" data-conn-value="${esc(row.value)}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;background:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
					<div style="display:flex;align-items:center;gap:10px;min-width:0;">
						<span style="font-weight:700;color:#0f172a;white-space:nowrap;">${esc(row.label)}</span>
						<span style="display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:700;">${Number(row.count || 0)}</span>
					</div>
					${showCreate ? `<button type="button" class="btn btn-default btn-xs" data-conn-create="${esc(row.key)}" style="width:30px;height:30px;border-radius:10px;padding:0;display:inline-flex;align-items:center;justify-content:center;"><i class="fa fa-plus"></i></button>` : `<span style="width:30px;height:30px;display:inline-block;"></span>`}
				</div>
			`;
				}).join("")
				: `<div class="text-muted" style="padding:8px 0;">No connections found.</div>`;

			$card.html(`
			<div class="panel-person-head">
				<div class="panel-person-head-left">
					<div class="panel-person-title-wrap">
						<div class="panel-person-name" title="${esc(__("Connections"))}"><i class="fa fa-link text-primary"></i>&nbsp; ${esc(__("Connections"))}</div>
						<div class="small muted">${esc(totalCount ? `${totalCount} document${totalCount === 1 ? "" : "s"}` : "No linked documents")}</div>
					</div>
				</div>
				<button type="button" class="panel-person-close" aria-label="Close">&times;</button>
			</div>
			<div style="padding-top:8px; max-height:calc(100vh - 220px); overflow:auto;">
				${html}
			</div>
		`);

			$panel.find(".panel__tabs, .panel__header, #panel-cards-section, #panel-form-section").addClass("d-none");
			$card.removeClass("d-none");
			this._rightPanelCardType = "connections";

			$card.off("click", ".panel-person-close").on("click", ".panel-person-close", () => {
				this._rightPanelCardType = "";
				this.hideRightPanelPersonCard();
			});

			$card.off("click", ".opp-conn-row").on("click", ".opp-conn-row", function () {
				const entry = {
					key: String($(this).data("connKey") || "").trim(),
					doctype: String($(this).data("connDoctype") || "").trim(),
					fieldUsed: String($(this).data("connField") || "").trim(),
					value: String($(this).data("connValue") || "").trim(),
				};
				me.open_connection_list(entry);
			});

			$card.off("click", "[data-conn-create]").on("click", "[data-conn-create]", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const key = String($(this).data("connCreate") || "").trim();
				const entry = rows.find((row) => String(row.key || "") === key) || {};
				me.create_connection_doc(entry, opportunityName);
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
					btns.forEach(b => { b.classList.remove("btn-info", "active-pagination"); b.style.backgroundColor = ""; b.style.color = ""; });
					btn.classList.add("btn-info", "active-pagination");
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
				activeBtn.classList.add("btn-info", "active-pagination");
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


		bindFilterEvents() {
			const me = this;
			const pageScope = this.getPageScope?.();
			const wrapper = pageScope?.[0] || this.page.wrapper[0] || this.page.wrapper;

			// ========= CONFIG =========
			const DOCTYPE = me.filter_doctype || OPP_CFG.DOCTYPE || "Customer Order Form";
			const LS_KEY = `${DOCTYPE.toLowerCase()}_theme_last_filters`;

			const parseFiltersParam = (rawValue = "") => {
				const raw = String(rawValue || "").trim();
				if (!raw) return [];
				try {
					const parsed = JSON.parse(raw);
					return Array.isArray(parsed) ? parsed : [];
				} catch (e) {
					try {
						const decoded = decodeURIComponent(raw);
						const parsed = JSON.parse(decoded);
						return Array.isArray(parsed) ? parsed : [];
					} catch (err) {
						return [];
					}
				}
			};

			// ========= BASIC FILTERS =========
			const statusFilter = wrapper.querySelector('[data-table-filter="status"]')
				|| wrapper.querySelector('#filterStatus');
			// const probabilityFilter = wrapper.querySelector('[data-table-filter="probability"]');

			const filterButton = wrapper.querySelector('.filter-button');
			const clearFilterButton = wrapper.querySelector('.filter-x-button');

			me.updateAdvancedFilterButtonCount();

			// ========= OWNER DROPDOWN =========
			// ========= OWNER DROPDOWN =========
			const ownerChip = document.getElementById("filterowner");
			const dropdown = document.getElementById("owner-dropdown");
			const search = document.getElementById("owner-search-dropdown");

			me.selectedOwners = Array.isArray(me.selectedOwners) ? me.selectedOwners : [];

			// Place and flip the dropdown depending on space
			const placeOwnerDropdown = () => {
				if (!ownerChip || !dropdown || dropdown.style.display === "none") return;
				const rect = ownerChip.getBoundingClientRect();
				const vh = window.innerHeight;
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
			const debounce1 = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
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
			const createdFrom = wrapper.querySelector('[data-table-filter="created_from"]');
			const createdTo = wrapper.querySelector('[data-table-filter="created_to"]');
			const modifiedFrom = wrapper.querySelector('[data-table-filter="modified_from"]');
			const modifiedTo = wrapper.querySelector('[data-table-filter="modified_to"]');
			const closeFrom = wrapper.querySelector('[data-table-filter="close_from"]');
			const closeTo = wrapper.querySelector('[data-table-filter="close_to"]');

			const dealMin = wrapper.querySelector('[data-table-filter="deal_min"]');
			const dealMax = wrapper.querySelector('[data-table-filter="deal_max"]');

			const customerInput = wrapper.querySelector('[data-table-filter="customer"]')
				|| wrapper.querySelector('[data-table-filter="account"]');
			const contactInput = wrapper.querySelector('[data-table-filter="contact"]');
			const industrySel = wrapper.querySelector('[data-table-filter="industry"]');
			const regionSel = wrapper.querySelector('[data-table-filter="region"]');
			const productSel = wrapper.querySelector('[data-table-filter="product"]');
			const tagsInput = wrapper.querySelector('[data-table-filter="tags"]');

			// ========= HELPERS =========
			const debounce = (fn, wait = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
			const parseNumber = (el) => el && el.value ? Number(el.value.replace(/,/g, '')) : null;
			const asDate = (el) => (el && el.value) ? el.value : "";

			// ========= CUSTOMER DROPDOWN =========
			const $customerInput = $(customerInput || []);
			const $customerDropdown = $("#customer-dropdown");
			const $customerOptions = $("#customer-options-dropdown");

			const placeCustomerDropdown = () => {
				if (!customerInput || !$customerDropdown.length || !$customerDropdown.is(":visible")) return;
				const rect = customerInput.getBoundingClientRect();
				const vh = window.innerHeight;
				const belowSpace = vh - rect.bottom;
				const want = Math.min(vh * 0.45, 300);
				if (belowSpace < want && rect.top > want) {
					$customerDropdown.addClass("customer-menu--above");
				} else {
					$customerDropdown.removeClass("customer-menu--above");
				}
			};

			const closeCustomerDropdown = () => {
				$customerDropdown.hide();
			};

			const openCustomerDropdown = () => {
				if (!$customerDropdown.length) return;
				$customerDropdown.show();
				placeCustomerDropdown();
			};

			const fetchCustomerSuggestions = async (text = "") => {
				try {
					const r = await frappe.call({
						method: OPP_CFG.API.get_customer_options,
						args: { search_text: text || "", limit: 20 },
					});
					const rows = r?.message;
					return Array.isArray(rows) ? rows : [];
				} catch (e) {
					return [];
				}
			};

			const renderCustomerSuggestions = async (text = "") => {
				if (!$customerOptions.length) return;
				const values = await fetchCustomerSuggestions(text);
				if (!values.length) {
					$customerOptions.html('<div class="customer-option-empty">No customers found</div>');
					return;
				}
				$customerOptions.html(values.map((value) => {
					const raw = String(value || "");
					const label = frappe.utils.escape_html(raw);
					const encoded = encodeURIComponent(raw);
					return `<div class="customer-option" data-value="${encoded}" title="${label}">${label}</div>`;
				}).join(""));
			};

			const onCustomerInput = debounce(async () => {
				if (!customerInput) return;
				me.active_customer = (customerInput.value || "").trim();
				fetchWithFilters();
				updateUrl();
				await renderCustomerSuggestions(me.active_customer);
				openCustomerDropdown();
			}, 260);

			$customerInput.off("focus.customerFilter input.customerFilter keydown.customerFilter");
			$customerInput.on("focus.customerFilter", async () => {
				await renderCustomerSuggestions((customerInput?.value || "").trim());
				openCustomerDropdown();
			});
			$customerInput.on("input.customerFilter", () => {
				onCustomerInput();
			});
			$customerInput.on("keydown.customerFilter", (e) => {
				if (e.key === "Escape") closeCustomerDropdown();
				if (e.key === "Enter") {
					me.active_customer = (customerInput?.value || "").trim();
					fetchWithFilters();
					updateUrl();
					closeCustomerDropdown();
				}
			});

			$customerOptions.off("click.customerFilter").on("click.customerFilter", ".customer-option", function () {
				const val = decodeURIComponent(String($(this).data("value") || "")).trim();
				if (customerInput) customerInput.value = val;
				me.active_customer = val;
				fetchWithFilters();
				updateUrl();
				closeCustomerDropdown();
			});

			$(document).off("mousedown.customerFilter").on("mousedown.customerFilter", (e) => {
				const inWrapper = $(e.target).closest(".customer-dropdown-wrapper").length;
				if (!inWrapper) closeCustomerDropdown();
			});
			$(window).off("resize.customerFilter scroll.customerFilter");
			$(window).on("resize.customerFilter", placeCustomerDropdown);
			$(window).on("scroll.customerFilter", placeCustomerDropdown);

			function validateRanges() {
				const min = parseNumber(dealMin);
				const max = parseNumber(dealMax);
				if (min != null && max != null && min > max) {
					me.showToast?.("Deal min cannot exceed max", "warning");
					return false;
				}
				const ranges = [
					{ from: asDate(createdFrom), to: asDate(createdTo), name: "Created" },
					{ from: asDate(modifiedFrom), to: asDate(modifiedTo), name: "Modified" },
					{ from: asDate(closeFrom), to: asDate(closeTo), name: "Expected Close" }
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

				// if (me.active_probability) {
				//   const m = String(me.active_probability).match(/^(\d+)\s*-\s*(\d+)$/);
				//   if (m) F("probability", "between", [Number(m[1]), Number(m[2])]);
				//   else   F("probability", "=", Number(me.active_probability));
				// }

				if (me.selectedOwners.length)
					F("owner", "in", me.selectedOwners);

				if (asDate(createdFrom)) F("creation", ">=", asDate(createdFrom));
				if (asDate(createdTo)) F("creation", "<=", asDate(createdTo));
				if (asDate(modifiedFrom)) F("modified", ">=", asDate(modifiedFrom));
				if (asDate(modifiedTo)) F("modified", "<=", asDate(modifiedTo));
				if (asDate(closeFrom)) F(OPP_CFG.EXPECTED_CLOSE_FIELD || "transaction_date", ">=", asDate(closeFrom));
				if (asDate(closeTo)) F(OPP_CFG.EXPECTED_CLOSE_FIELD || "transaction_date", "<=", asDate(closeTo));

				const dmin = parseNumber(dealMin), dmax = parseNumber(dealMax);
				if (dmin != null) F(OPP_CFG.AMOUNT_FIELD || "grand_total", ">=", dmin);
				if (dmax != null) F(OPP_CFG.AMOUNT_FIELD || "grand_total", "<=", dmax);

				const customerValue = me.active_customer || me.active_account || "";
				if (customerValue) F("customer", "like", `%${customerValue}%`);
				if (me.active_contact) F("contact_person", "like", `%${me.active_contact}%`);
				if (me.active_industry) F("industry", "=", me.active_industry);
				if (me.active_region) F("territory", "=", me.active_region);
				if (me.active_product) F("item_group", "=", me.active_product);
				if (me.active_tags) F("_user_tags", "like", `%${me.active_tags}%`);

				return f;
			}

			function fetchWithFilters() {
				const merged = [...basicFilters(), ...(me.saved_filters || [])];
				me.fetch_list_data({
					reset: true,
					saved_filters: merged,
					override_filters: {
						status: me.active_status || "",
						// probability: me.active_probability || "",
						owners: me.selectedOwners
					}
				});
			}
			me._fetchWithFilters = fetchWithFilters;

			function updateUrl() {
				// Start from a clean URL (pathname only) so no stale params from previous state survive.
				const newUrl = new URL(window.location.pathname, window.location.origin);
				const params = {
					status: me.active_status || "",
					// probability: me.active_probability || "",
					owners: me.selectedOwners.join(","),
					created_from: asDate(createdFrom),
					created_to: asDate(createdTo),
					modified_from: asDate(modifiedFrom),
					modified_to: asDate(modifiedTo),
					close_from: asDate(closeFrom),
					close_to: asDate(closeTo),
					deal_min: parseNumber(dealMin) ?? "",
					deal_max: parseNumber(dealMax) ?? "",
					customer: customerInput?.value || "",
					contact: contactInput?.value || "",
					industry: industrySel?.value || "",
					region: regionSel?.value || "",
					product: productSel?.value || "",
					tags: tagsInput?.value || ""
				};

				Object.entries(params).forEach(([k, v]) => {
					if (v !== "" && v !== null && v !== undefined) newUrl.searchParams.set(k, v);
				});

				if (me.saved_filters?.length)
					newUrl.searchParams.set("filters", JSON.stringify(me.saved_filters));

				window.history.replaceState({}, "", newUrl.toString());
				try {
					if (newUrl.search) localStorage.setItem(OPP_CFG.LS.last_filters, newUrl.search);
					else localStorage.removeItem(OPP_CFG.LS.last_filters);
				} catch { }
				// Count all active basic params + advanced filters for accurate button label.
				const basicCount = Object.values(params).filter(v => v !== "" && v !== null && v !== undefined).length;
				const advCount = Array.isArray(me.saved_filters) ? me.saved_filters.length : 0;
				me.updateAdvancedFilterButtonCount(basicCount + advCount);
			}

			// ========= LISTENERS =========

			statusFilter?.addEventListener("change", () => {
				me.active_status = statusFilter.value || "";
				fetchWithFilters();
				updateUrl();
			});

			// probabilityFilter?.addEventListener("change", () => {
			//   me.active_probability = probabilityFilter.value || "";
			//   fetchWithFilters();
			//   updateUrl();
			// });

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
				el?.addEventListener("input", debounce(() => {
					me[key] = el.value.trim();
					fetchWithFilters();
					updateUrl();
				}, 300));

			bindText("active_customer", customerInput);
			bindText("active_contact", contactInput);
			bindText("active_tags", tagsInput);

			industrySel?.addEventListener("change", () => { me.active_industry = industrySel.value; fetchWithFilters(); updateUrl(); });
			regionSel?.addEventListener("change", () => { me.active_region = regionSel.value; fetchWithFilters(); updateUrl(); });
			productSel?.addEventListener("change", () => { me.active_product = productSel.value; fetchWithFilters(); updateUrl(); });

			// ========= ADVANCED FILTER POPUP (unchanged) =========
			const advancedFilterForm = $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first().length
				? $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first()
				: $(wrapper);

			advancedFilterForm.find(".filter-button").on("click", async function (evt) {
				me._suspend_on_change = true;
				evt.preventDefault(); evt.stopPropagation();

				const $btn = $(this);
				if ($btn.data("bs.popover")) {
					me.closeListFilterUi();
					return;
				}

				me.closeListFilterUi();

				let popover_content = $('<div class="filter-area">');
				await frappe.model.with_doctype(DOCTYPE);

				let FG = new frappe.ui.FilterGroup({
					parent: popover_content,
					doctype: DOCTYPE,
					on_change: function () {
						if (me._suspend_on_change) return;
						me.saved_filters = FG.get_filters();
						const filterCount = me.saved_filters ? (Array.isArray(me.saved_filters) ? me.saved_filters.length : 0) : 0;
						fetchWithFilters();
						updateCount($btn, filterCount);
						updateUrl();
					}
				});

				FG.update_filter_button = function () { };

				let lastDownInsidePopover = false;
				let lastDownOnRemove = false;

				function isDatepickerNode(node) {
					if (!node) return false;
					return !!node.closest && !!node.closest(
						'.flatpickr-calendar, .ui-datepicker, .datepicker, .bootstrap-datetimepicker-widget, .pika-single, .daterangepicker'
					);
				}

				function onDocMouseDownCapture(ev) {
					const inside = !!ev.target.closest(".filter-popover");
					const onRemove = !!ev.target.closest(".filter-popover .filter-remove, .filter-popover .remove-filter");
					const clickedDatepicker =
						isDatepickerNode(ev.target) ||
						(ev.composedPath && ev.composedPath().some(n => n && n.classList && (
							n.classList.contains('flatpickr-calendar') ||
							n.classList.contains('ui-datepicker') ||
							n.classList.contains('datepicker') ||
							n.classList.contains('bootstrap-datetimepicker-widget') ||
							n.classList.contains('pika-single') ||
							n.classList.contains('daterangepicker')
						)));
					lastDownInsidePopover = inside || clickedDatepicker;
					lastDownOnRemove = onRemove;
				}

				function onDatepickerPointerDown(ev) {
					if (isDatepickerNode(ev.target)) lastDownInsidePopover = true;
				}

				document.addEventListener("mousedown", onDocMouseDownCapture, true);
				document.addEventListener("pointerdown", onDatepickerPointerDown, true);

				popover_content.on("pointerdown", ".filter-remove, .remove-filter", function (ev) {
					ev.stopPropagation();
					lastDownInsidePopover = true;
					lastDownOnRemove = true;
				});

				setTimeout(() => {
					if (me.saved_filters.length) FG.add_filters(me.saved_filters);
					else FG.add_filter(DOCTYPE, "name", "=", "", false);
				}, 0);

				const footer = $(`
				<div class="filter-action-buttons mt-1 d-flex justify-content-between align-items-center">
					<button type="button" class="text-muted add-filter btn btn-xs">+ Add a Filter</button>
					<div>
						<button type="button" class="btn btn-secondary btn-xs clear-filters mr-2">Clear</button>
						<button type="button" class="btn btn-primary btn-xs apply-filters">Apply</button>
					</div>
				</div>
			`);

				popover_content.find(".filter-action-buttons").remove();
				popover_content.append(footer);

				footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));

				footer.find(".clear-filters").on("click", () => {
					FG.clear_filters();
					FG.toggle_empty_filters(true);
					me.saved_filters = [];
					me._suspend_on_change = false;
					fetchWithFilters();
					updateCount($btn, 0);
					updateUrl();
					me.scheduleFilterCountSync();
					closePopover($btn);
				});

				footer.find(".apply-filters").on("click", () => {
					me.saved_filters = FG.get_filters();
					const filterCount = me.saved_filters ? (Array.isArray(me.saved_filters) ? me.saved_filters.length : 0) : 0;
					me._suspend_on_change = false;
					fetchWithFilters();
					updateCount($btn, filterCount);
					updateUrl();
					me.scheduleFilterCountSync();
					closePopover($btn);
				});

				$btn.popover({
					html: true,
					placement: "bottom",
					content: popover_content,
					trigger: "manual",
					container: document.body,
					template: `
        <div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
          <div class="arrow"></div>
          <div class="popover-body popover-content"></div>
        </div>
      `,
					popperConfig: {
						modifiers: [
							{ name: 'offset', options: { offset: [0, 4] } },
							{ name: 'preventOverflow', options: { padding: 10, altBoundary: true } }
						]
					}
				}).popover("show");

				function isInsidePopoverOrBtn(event) {
					if ($(event.target).closest(".filter-popover, .filter-button").length) return true;
					const oe = event.originalEvent || event;
					if (oe && typeof oe.composedPath === "function") {
						const path = oe.composedPath();
						if (path.some(node => node && node.classList && (
							node.classList.contains('filter-popover') ||
							node.classList.contains('filter-button') ||
							node.classList.contains('flatpickr-calendar') ||
							node.classList.contains('ui-datepicker') ||
							node.classList.contains('datepicker') ||
							node.classList.contains('bootstrap-datetimepicker-widget') ||
							node.classList.contains('pika-single') ||
							node.classList.contains('daterangepicker')
						))) return true;
					}
					if (isDatepickerNode(event.target)) return true;
					return false;
				}

				const onDocClick = function (event) {
					if (lastDownOnRemove || lastDownInsidePopover || isInsidePopoverOrBtn(event)) {
						lastDownOnRemove = false;
						return;
					}
					closePopover($btn);
				};

				$(document).on("click.filterPopover", onDocClick);
				$btn.data("guardHandlers", { onDocClick, onDocMouseDownCapture, onDatepickerPointerDown });

				function closePopover($b) {
					teardownGuards($b);
					try { $b.popover("dispose"); } catch (e) { /* noop */ }
					$(".filter-popover").remove();
				}

				function teardownGuards($b) {
					const g = $b.data("guardHandlers");
					if (g) {
						$(document).off("click.filterPopover", g.onDocClick);
						document.removeEventListener("mousedown", g.onDocMouseDownCapture, true);
						document.removeEventListener("pointerdown", g.onDatepickerPointerDown, true);
						$b.removeData("guardHandlers");
					}
				}

				function updateCount($b, c) {
					const safe = Number(c) || 0;
					const next = safe > 0 ? `Filters (${safe})` : "Filters";
					const $label = $b?.find?.(".button-label");
					if ($label?.length) {
						$label.text(next);
					}
					$b?.attr?.("data-filter-count", String(safe));
					$b?.attr?.("title", next);
					me.updateAdvancedFilterButtonCount(c);
				}
			});

			// ========= CLEAR BUTTON =========
			clearFilterButton?.addEventListener("click", () => {
				me.closeListFilterUi();
				me.saved_filters = [];
				me.selectedOwners = [];
				me.active_status = "";
				me.active_customer = "";
				me.active_account = "";
				me.active_contact = "";
				me.active_industry = "";
				me.active_region = "";
				me.active_product = "";
				me.active_tags = "";
				// me.active_probability="";
				[
					statusFilter, industrySel, regionSel, productSel,
					createdFrom, createdTo, modifiedFrom, modifiedTo, closeFrom, closeTo,
					dealMin, dealMax, customerInput, contactInput, tagsInput
				].forEach(el => { if (el) el.value = ""; });
				me.updateOwnerChip();
				me.renderOwners("");
				me.updateAdvancedFilterButtonCount(0);
				updateUrl();
				me.scheduleFilterCountSync();
				fetchWithFilters();
			});
		}

		closeListFilterUi() {
			const wrapper = this.page?.wrapper?.[0] || this.page?.wrapper || document;
			const $wrapper = $(wrapper);

			$wrapper.find(".filter-button").each((_, button) => {
				const $button = $(button);
				// Teardown per-button guard listeners (mousedown/pointerdown capture)
				const g = $button.data("guardHandlers");
				if (g) {
					$(document).off("click.filterPopover", g.onDocClick);
					document.removeEventListener("mousedown", g.onDocMouseDownCapture, true);
					document.removeEventListener("pointerdown", g.onDatepickerPointerDown, true);
					$button.removeData("guardHandlers");
				}
				if ($button.data("bs.popover")) {
					try {
						$button.popover("dispose");
					} catch (err) {
						// noop
					}
				}
			});

			$(document).off("click.filterPopover");
			$(".filter-popover").remove();

			const ownerDropdown = document.getElementById("owner-dropdown");
			if (ownerDropdown) {
				ownerDropdown.style.display = "none";
				ownerDropdown.classList.remove("owner-menu--above");
			}

			const ownerSearch = document.getElementById("owner-search-dropdown");
			if (ownerSearch) ownerSearch.value = "";

			const $customerDropdown = $("#customer-dropdown");
			if ($customerDropdown.length) {
				$customerDropdown.hide().removeClass("customer-menu--above");
			}
		}

		updateAdvancedFilterButtonCount(count = undefined) {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;

			// Update every filter button in scope to avoid stale hidden-node targeting.
			const $targetButtons = $(wrapper).find('.filter-button');
			if (!$targetButtons.length) return;

			let safeCount = (count !== undefined && count !== null && Number.isFinite(Number(count)))
				? Number(count)
				: 0;

			if (count === undefined || count === null || !Number.isFinite(Number(count))) {
				try {
					const params = new URLSearchParams(window.location.search || "");
					const basicKeys = [
						"status",
						"customer",
						"account",
						"owners",
						"created_from",
						"created_to",
						"modified_from",
						"modified_to",
						"close_from",
						"close_to",
						"deal_min",
						"deal_max",
						"contact",
						"industry",
						"region",
						"product",
						"tags",
					];

					basicKeys.forEach((key) => {
						const value = String(params.get(key) || "").trim();
						if (value) safeCount += 1;
					});

					const rawFilters = String(params.get("filters") || "").trim();
					if (rawFilters) {
						let parsedFilters = [];
						try {
							const direct = JSON.parse(rawFilters);
							parsedFilters = Array.isArray(direct) ? direct : [];
						} catch (e) {
							try {
								const decoded = decodeURIComponent(rawFilters);
								const decodedParsed = JSON.parse(decoded);
								parsedFilters = Array.isArray(decodedParsed) ? decodedParsed : [];
							} catch (err) {
								parsedFilters = [];
							}
						}
						safeCount += parsedFilters.length || (this.saved_filters || []).length;
					} else {
						safeCount += (this.saved_filters || []).length;
					}
				} catch (e) {
					safeCount = (this.saved_filters || []).length;
				}
			}

			const nextText = safeCount > 0 ? `Filters (${safeCount})` : "Filters";
			$targetButtons.each((_, btn) => {
				const $btn = $(btn);
				const $label = $btn.find('.button-label');
				if ($label.length) {
					$label.text(nextText);
				}
				$btn.attr('data-filter-count', String(safeCount));
				$btn.attr('title', nextText);
			});

			// Keep id-based nodes in sync when present.
			$('#opp-filter-button-label').text(nextText);
			$('#opp-filter-button').attr('data-filter-count', String(safeCount));
			$('#opp-filter-button').attr('title', nextText);
		}

		scheduleFilterCountSync() {
			[0, 80, 240].forEach((delay) => {
				setTimeout(() => {
					this.updateAdvancedFilterButtonCount();
				}, delay);
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
					if (typeof this._fetchWithFilters === "function") {
						this._fetchWithFilters();
					} else {
						this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
					}
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
			const customer = params.get("customer") || params.get("account") || "";
			// const probability = params.get("probability") || "";
			const owners_raw = params.get("owners") || "";
			const owners = owners_raw ? owners_raw.split(",").map(v => v.trim()).filter(Boolean) : [];
			const filters_encoded = params.get("filters") || "";

			const pageScope = this.getPageScope?.();
			const wrapper = pageScope?.[0] || this.page.wrapper[0] || this.page.wrapper;
			const statusSel = wrapper.querySelector('#filterStatus');
			const customerInput = wrapper.querySelector('[data-table-filter="customer"]')
				|| wrapper.querySelector('[data-table-filter="account"]');
			// const probSel = wrapper.querySelector('#filterProbability');
			const owner = wrapper.querySelector('[data-table-range-filter="owner"]');

			if (statusSel) { statusSel.value = status; if (!status) statusSel.classList.add("placeholder"); else statusSel.classList.remove("placeholder"); }
			if (customerInput) { customerInput.value = customer; }
			// if (probSel) { probSel.value = probability; if (!probability) probSel.classList.add("placeholder"); else probSel.classList.remove("placeholder"); }
			if (owner) {
				this.selectedOwners = owners;
				this.updateOwnerChip();
			}

			this.active_status = status;
			this.active_customer = customer;
			// this.active_probability = probability;
			this.selectedOwners = owners;
			this.updateOwnerChip();

			// advanced filters
			this.saved_filters = [];
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

			this.updateAdvancedFilterButtonCount();
			this.scheduleFilterCountSync();

			if (typeof this._fetchWithFilters === "function") {
				this._fetchWithFilters();
			} else {
				this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });
			}
		}

		updateUrl() {
			try {
				const newUrl = new URL(window.location.href);
				// basic filters
				if (this.active_status) newUrl.searchParams.set("status", this.active_status);
				else newUrl.searchParams.delete("status");

				if (this.active_customer) newUrl.searchParams.set("customer", this.active_customer);
				else newUrl.searchParams.delete("customer");

				// if (this.active_probability) newUrl.searchParams.set("probability", this.active_probability);
				// else newUrl.searchParams.delete("probability");

				if ((this.selectedOwners || []).length) {
					newUrl.searchParams.set("owners", this.selectedOwners.join(","));
				} else {
					newUrl.searchParams.delete("owners");
				}

				// advanced filters (if you wire the popover, encode & set here)
				if ((this.saved_filters || []).length) {
					newUrl.searchParams.set("filters", JSON.stringify(this.saved_filters));
				} else {
					newUrl.searchParams.delete("filters");
				}

				window.history.replaceState({}, "", newUrl.toString());
				this.updateAdvancedFilterButtonCount();
				this.scheduleFilterCountSync();
			} catch (err) {
				console.error("URL update failed:", err);
			}
		}

		// -------- HELPERS --------
		initials(name) {
			const p = (name || "User").trim().split(/\s+/);
			return ((p[0]?.[0] || "U") + (p[p.length - 1]?.[0] || "")).toUpperCase();
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
			if (years > 0) return years + "y";
			if (months > 0) return months + "m";
			if (days > 0) return days + "d";
			if (hours > 0) return hours + "h";
			if (minutes > 0) return minutes + "m";
			return seconds + "s";
		}
		formatDate(dateStr) {
			if (!dateStr) return "";
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) return "";
			return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      <small class="text-muted">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
		}
		getStageClass(stage) {
			const normalized = String(stage || "").trim().toLowerCase();
			if (!normalized) return "bg-light";
			if (normalized === "open" || normalized.includes("proposal") || normalized.includes("prospecting")) return "open1";
			if (normalized.includes("quotation")) return "pending";
			if (normalized === "converted" || normalized.includes("closed won") || normalized === "won") return "resolved";
			if (normalized === "lost" || normalized.includes("closed lost")) return "closed1";
			if (normalized.includes("on hold") || normalized.includes("hold")) return "on_hold";
			return "bg-light";
		}
	}


	// ---- TEMPLATE ----
	frappe.customer_order_forms_page_template = {
		body: `
    <div class="wrapper quotation-list-wrapper customer-order-forms-wrapper">
      <style>
        .quotation-list-list .left-controls{
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .quotation-list-list .list-filter-customer{
          min-width: 170px;
          max-width: 230px;
        }
        .quotation-list-list .customer-dropdown-wrapper{
          position: relative;
          min-width: 170px;
          max-width: 230px;
        }
        .quotation-list-list .customer-dropdown{
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          min-width: 100%;
          border: 1px solid #d8dde6;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
          z-index: 1000;
          overflow: hidden;
          display: none;
        }
        .quotation-list-list .customer-dropdown.customer-menu--above{
          top: auto;
          bottom: calc(100% + 4px);
        }
        .quotation-list-list #customer-options-dropdown{
          max-height: 300px;
          overflow-y: auto;
          padding: 4px;
        }
        .quotation-list-list .customer-option,
        .quotation-list-list .customer-option-empty{
          padding: 7px 8px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.3;
        }
        .quotation-list-list .customer-option{
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quotation-list-list .customer-option:hover{
          background: #f4f7fb;
        }
        .quotation-list-list .customer-option-empty{
          color: #6b7280;
        }
        .quotation-list-list #filterowner{
          min-width: 170px;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
        }
        .quotation-list-list .working-agent-dropdown{
          min-width: 230px;
          border: 1px solid #d8dde6;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
          z-index: 1000;
          overflow: hidden;
        }
        .quotation-list-list .working-agent-search-box{
          padding: 8px;
          border-bottom: 1px solid #eef1f4;
          background: #fff;
        }
        .quotation-list-list .working-agent-search-box input{
          width: 100%;
          border: 1px solid #d8dde6;
          border-radius: 6px;
          height: 28px;
          padding: 0 8px;
          outline: none;
        }
        .quotation-list-list #owner-options-dropdown{
          max-height: 300px;
          overflow-y: auto;
          padding: 4px;
        }
        .quotation-list-list .working-agent-option{
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 7px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          line-height: 1.3;
        }
        .quotation-list-list .working-agent-option:hover{
          background: #f4f7fb;
        }
        .quotation-list-list .working-agent-option .owner-name{
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quotation-list-list .working-agent-option .owner-check{
          opacity: 0;
          color: #3b82f6;
          font-size: 12px;
        }
        .quotation-list-list .working-agent-option.is-selected{
          background: #eef4ff;
          color: #0f172a;
          font-weight: 500;
        }
        .quotation-list-list .working-agent-option.is-selected .owner-check{
          opacity: 1;
        }

        .quotation-list-new{
          padding: 18px;
          background: #f4f6f8;
          min-height: calc(100vh - 120px);
        }

        .new-opportunity-wrap{
          width: 100%;
          max-width: none;
          margin: 0;
        }

        .new-opportunity-card{
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          padding: 16px;
          margin-top: 12px;
        }

        .new-opportunity-form{
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .new-opp-row{
          display: grid;
          gap: 12px;
        }

        .new-opp-row.two-col{
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .new-opp-row.three-col{
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: start;
        }

        .new-opp-col{
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .new-opp-row.one-col{
          grid-template-columns: 1fr;
        }

        .new-opp-field{
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .new-opp-field > label{
          font-size: 12px;
          color: #6b7280;
          font-weight: 600;
          margin: 0;
          line-height: 1.25;
        }

        .new-opp-field > label.control-label.reqd .fa-plus{
          cursor: pointer;
          color: var(--primary);
          margin-left: 4px;
          font-size: 12px;
        }

        .new-opp-field .form-control{
          border-radius: 10px;
          min-height: 34px;
          padding: 6px 10px;
        }

        .new-opp-field textarea.form-control{
          min-height: 84px;
          resize: vertical;
        }

        .new-opp-link-control .frappe-control,
        .new-opp-link-control .form-group,
        .new-opp-link-control .control-input-wrapper,
        .new-opp-link-control .control-input,
        .new-opp-link-control .control-value,
        .new-opp-link-control .awesomplete,
        .new-opp-link-control .awesomplete input,
        .new-opp-link-control input.form-control{
          width: 100%;
          margin: 0 !important;
          padding: 0;
        }

        .new-opp-link-control .form-group{
          margin-bottom: 0 !important;
        }

        .new-opp-link-control .clearfix,
        .new-opp-link-control .help-box,
        .new-opp-link-control .control-label,
        .new-opp-link-control .like-disabled-input-for-empty,
        .new-opp-link-control .link-btn{
          display: none !important;
        }

        .new-opp-link-control .control-input-wrapper{
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .new-opp-link-control .awesomplete,
        .new-opp-link-control .awesomplete > input,
        .new-opp-link-control input.form-control,
        .new-opp-link-control .control-input > input{
          height: 34px;
          line-height: 1.2;
          margin: 0 !important;
        }

        .new-opp-link-control .awesomplete input,
        .new-opp-link-control input.form-control{
          border-radius: 10px;
          min-height: 34px;
          padding: 6px 10px;
        }

        .new-opp-display-value{
          min-height: 34px;
          border: 1px solid #d8dde6;
          border-radius: 10px;
          background: #f5f7f9;
          padding: 6px 10px;
          font-size: 14px;
          color: #111827;
          display: flex;
          align-items: center;
        }

        .new-opp-contact-list{
          min-height: 24px;
          border: none;
          border-radius: 0;
          background: transparent;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: stretch;
        }

        .new-opp-contact-empty{
          color: #6b7280;
          font-size: 12px;
          padding-left: 2px;
        }

        .new-opp-contact-chip{
          display: inline-flex;
          align-items: flex-start;
          gap: 6px;
          max-width: 100%;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          font-size: 12px;
          color: #111827;
        }

        .new-opp-contact-chip-main{
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: 1px;
        }

        .new-opp-contact-chip-text{
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .new-opp-contact-chip-sub{
          font-size: 11px;
          color: #6b7280;
          line-height: 1.2;
          white-space: nowrap;
        }

        .new-opp-contact-chip-remove{
          color: #6b7280;
          cursor: pointer;
          font-size: 11px;
        }

        .new-opp-contact-entry{
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 2px 0;
        }

        .new-opp-contact-entry-top{
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .new-opp-contact-entry-name{
          color: #111827;
          font-size: 14px;
          line-height: 1.25;
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .new-opp-contact-name-toggle{
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: inline-block;
          max-width: 280px;
        }

        .new-opp-contact-entry-details{
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-left: 20px;
        }

        .new-opp-contact-entry-meta{
          color: #6b7280;
          font-size: 12px;
          line-height: 1.2;
          padding-left: 0;
        }

        .new-opp-contact-delete{
          color: #dc2626;
          cursor: pointer;
          font-size: 12px;
        }

        .new-opp-contact-tpoc{
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
        }

        .new-opp-contact-tpoc.is-active{
          color: #16a34a;
        }

        .new-opp-contact-tpoc.is-inactive{
          color: #cbd5e1;
        }

        .new-opp-subhead{
          margin-bottom: 6px;
        }

        .new-opp-table-wrap{
          max-height: 270px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto !important;
          overflow-y: auto !important;
        }

				.new-opp-preview-table-wrap{
					max-height: none !important;
					overflow: visible !important;
				}

				.new-opp-preview-table{
					min-width: 0 !important;
					table-layout: auto !important;
				}

				.new-opp-preview-table th,
				.new-opp-preview-table td{
					white-space: nowrap !important;
					overflow: hidden !important;
					text-overflow: ellipsis !important;
					padding: 10px 12px;
				}

				.new-opp-preview-table th:nth-child(1),
				.new-opp-preview-table td:nth-child(1){ width: 56px; }
				.new-opp-preview-table th:nth-child(2),
				.new-opp-preview-table td:nth-child(2){ width: 180px; }
				.new-opp-preview-table th:nth-child(3),
				.new-opp-preview-table td:nth-child(3){ width: 260px; }
				.new-opp-preview-table th:nth-child(4),
				.new-opp-preview-table td:nth-child(4){ width: 140px; }
				.new-opp-preview-table th:nth-child(5),
				.new-opp-preview-table td:nth-child(5){ width: 150px; }
				.new-opp-preview-table th:nth-child(6),
				.new-opp-preview-table td:nth-child(6){ width: 170px; }

				.new-opp-cell-ellipsis{
					display: inline-block;
					max-width: 100%;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					vertical-align: bottom;
				}

				.new-opp-preview-table thead th{
					position: static !important;
					transform: none !important;
					text-transform: none;
					font-size: 12px;
					letter-spacing: 0;
				}

        #new-opp-items-table-wrap::-webkit-scrollbar{
          height: 12px;
        }

				.new-opp-item-code-link-control,
				.new-opp-item-code-link-control .frappe-control,
				.new-opp-item-code-link-control .form-group,
				.new-opp-item-code-link-control .clearfix,
				.new-opp-item-code-link-control .control-input-wrapper,
				.new-opp-item-code-link-control .control-input,
        .new-opp-item-code-link-control .awesomplete,
        .new-opp-item-code-link-control .awesomplete input,
        .new-opp-item-code-link-control input.form-control{
          width: 100%;
          margin: 0 !important;
					padding-bottom: 0 !important;
        }

        .new-opp-item-code-link-control .control-label,
        .new-opp-item-code-link-control .help-box,
        .new-opp-item-code-link-control .clearfix,
        .new-opp-item-code-link-control .link-btn{
          display: none !important;
        }

        .new-opp-item-code-link-control .awesomplete input,
        .new-opp-item-code-link-control input.form-control{
					min-height: 38px;
					height: 38px;
          border-radius: 8px;
          font-size: 12px;
          padding: 5px 8px;
        }

        .new-opp-row-actions{
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .new-opp-add-row-wrap{
          margin-top: 8px;
          display: flex;
          justify-content: flex-start;
        }

				.new-opp-item-wizard-inline-section{
				margin-top: 20px;
				border: 1px solid #d0d8e8;
				border-radius: 12px;
				background: linear-gradient(135deg, #f5f8ff 0%, #fafbff 100%);
				padding: 20px 24px;
				box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04);
			}

			.new-opp-item-wizard-inline-header{
				margin-bottom: 16px;
				padding-bottom: 12px;
				border-bottom: 1px solid #e2e8f0;
			}

			.new-opp-item-wizard-inline-title{
				font-size: 18px;
				font-weight: 700;
				color: #0f172a;
				letter-spacing: 0.3px;
			}

			.new-opp-item-wizard-inline-subtitle{
				margin-top: 4px;
				color: #64748b;
				font-size: 13px;
				font-weight: 500;
			}

			.new-opp-item-wizard-inline-stepper{
				display: flex;
				align-items: center;
				gap: 0;
				margin-bottom: 16px;
				flex-wrap: wrap;
				background: #fff;
				border: 1px solid #dce4f0;
				border-radius: 10px;
				overflow: hidden;
				box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
			}

			.new-opp-item-wizard-inline-step{
				display: inline-flex;
				align-items: center;
				gap: 8px;
				color: #64748b;
				font-weight: 600;
				padding: 12px 16px;
				position: relative;
				font-size: 13px;
				flex: 1;
				min-width: 100px;
				justify-content: center;
			}

			.new-opp-item-wizard-inline-step + .new-opp-item-wizard-inline-step::before{
				content: "";
				position: absolute;
				left: 0;
				top: 10px;
				bottom: 10px;
				width: 1px;
				background: #e2e8f0;
			}

			.new-opp-item-wizard-inline-step .dot{
				width: 24px;
				height: 24px;
				border-radius: 999px;
				border: 2px solid #cbd5e1;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				font-size: 12px;
				font-weight: 700;
				background: #fff;
				color: #64748b;
			}

			.new-opp-item-wizard-inline-step.is-active{
				color: #1e40af;
				background: #f0f7ff;
			}

			.new-opp-item-wizard-inline-step.is-active .dot{
				border-color: #1e40af;
				background: #1e40af;
				color: #fff;
			}

			.new-opp-item-wizard-inline-step.is-done .dot{
				border-color: #059669;
				background: #059669;
				color: #fff;
			}

			.new-opp-item-wizard-inline-body {
				background: #fff;
				border-radius: 8px;
				padding: 16px;
				margin-bottom: 12px;
			}

			.new-opp-item-wizard-inline-actions{
				margin-top: 16px;
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 10px;
				flex-wrap: wrap;
				padding-top: 14px;
				}

				.new-opp-item-wizard-inline-actions-right{
					display: inline-flex;
					align-items: center;
					gap: 8px;
				}

				.new-opp-inline-type-grid{
					display: grid;
					grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 12px;
				margin-bottom: 4px;
			}

			.new-opp-inline-type-card{
				border: 2px solid #dbe4ef;
				border-radius: 10px;
				background: #fff;
				padding: 14px 12px;
				cursor: pointer;
				transition: all 0.25s ease;
				font-weight: 600;
				color: #1f2937;
				min-height: 80px;
				display: flex;
				flex-direction: column;
				justify-content: center;
				gap: 4px;
			}

			.new-opp-inline-type-card .type-title{
				font-size: 15px;
				font-weight: 700;
				line-height: 1.3;
				color: #0f172a;
			}

			.new-opp-inline-type-card .type-subtitle{
				font-size: 12px;
				font-weight: 500;
				color: #64748b;
				line-height: 1.3;
			}

			.new-opp-inline-type-card:hover{
				border-color: #3b82f6;
				box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
				transform: translateY(-2px);
			}

			.new-opp-inline-type-card.is-selected{
				border-color: #1e40af;
				box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.15);
				background: #f0f7ff;
				color: #1e40af;
			}

			.new-opp-inline-type-card.is-selected .type-subtitle{
				color: #1e40af;
			}

			.new-opp-item-wizard-inline-body .form-control,
			.new-opp-item-wizard-inline-body .awesomplete > input,
			.new-opp-item-wizard-inline-body .control-input > input{
				border-radius: 8px;
				min-height: 38px;
				font-size: 13px;
				border: 1px solid #d7e2f3;
				transition: all 0.2s ease;
			}

			.new-opp-item-wizard-inline-body .form-control:focus,
			.new-opp-item-wizard-inline-body .awesomplete > input:focus,
			.new-opp-item-wizard-inline-body .control-input > input:focus{
				border-color: #1e40af;
				box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
			}

			.new-opp-item-wizard-inline-body .new-opp-display-value{
				background: #f8fafc;
				border: 1px solid #d7e2f3;
				font-weight: 600;
				padding: 10px 12px;
				border-radius: 6px;
				color: #1f2937;
				font-size: 13px;
			}

			.new-opp-item-wizard-inline-body .new-opp-field{
				margin-bottom: 2px;
			}

			.new-opp-item-wizard-inline-body .new-opp-field label{
				font-size: 13px;
				font-weight: 600;
				color: #374151;
				margin-bottom: 6px;
				display: block;
			}

			.new-opp-item-wizard-inline-body #inline-wizard-cancel,
			.new-opp-item-wizard-inline-body #inline-wizard-back{
				border-radius: 8px;
				border: 1px solid #cbd5e1;
				background: #fff;
				color: #374151;
				font-weight: 600;
				padding: 8px 16px;
				transition: all 0.2s ease;
				min-height: auto;
			}

			.new-opp-item-wizard-inline-body #inline-wizard-cancel:hover,
			.new-opp-item-wizard-inline-body #inline-wizard-back:hover{
				background: #f3f4f6;
				border-color: #9ca3af;
			}

			.new-opp-item-wizard-inline-body #inline-wizard-next,
			.new-opp-item-wizard-inline-body #inline-wizard-save{
				border-radius: 8px;
				padding: 8px 16px;
				font-weight: 700;
				font-size: 13px;
				box-shadow: 0 2px 6px rgba(30, 64, 175, 0.2);
				transition: all 0.2s ease;
				min-height: auto;
				border: none;
			}

			.new-opp-item-wizard-inline-body #inline-wizard-next:hover,
			.new-opp-item-wizard-inline-body #inline-wizard-save:hover{
				box-shadow: 0 4px 12px rgba(30, 64, 175, 0.35);
				transform: translateY(-1px);
			}

			.new-opp-item-wizard-inline-body .new-opp-row{
				display: grid;
				gap: 12px;
				margin-bottom: 14px;
			}

			.new-opp-item-wizard-inline-body .new-opp-row.two-col{
				grid-template-columns: 1fr 1fr;
			}

			.new-opp-item-wizard-inline-body .new-opp-row.three-col{
				grid-template-columns: 1fr 1fr 1fr;
			}

			.new-opp-item-wizard-inline-body .new-opp-row.four-col{
				grid-template-columns: 1fr 1fr 1fr 1fr;
			}

			.new-opp-item-wizard-inline-body .new-opp-row.one-col{
				grid-template-columns: 1fr;
			}

			.new-opp-item-wizard-inline-body .new-opp-inline-sub-card{
				margin-top: 8px;
				margin-bottom: 14px;
				padding: 12px;
				border: 1px solid #d7e2f3;
				background: #f8fafc;
				border-radius: 10px;
			}

			.new-opp-item-wizard-inline-body .new-opp-link-control{
				display: block;
			}

			.new-opp-item-wizard-inline-body .new-opp-link-control .input-with-feedback{
				display: flex;
			}

			.new-opp-item-wizard-inline-body .new-opp-link-control input{
				border-radius: 8px;
				min-height: 38px;
				font-size: 13px;
				border: 1px solid #d7e2f3;
				padding: 8px 12px;
				flex: 1;
			}

			.new-opp-item-wizard-inline-body .new-opp-link-control input:focus{
				border-color: #1e40af;
				box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
				outline: none;
			}

        .new-opp-footer{
          display: flex;
          justify-content: flex-end;
          margin-top: 6px;
        }

        /* ---- Wizard Stepper ---- */
        .new-opp-wizard-bar{
          display: flex;
          align-items: center;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px 24px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .new-opp-wizard-step{
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }

        .new-opp-wizard-circle{
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #e5e7eb;
          color: #9ca3af;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s;
        }

        .new-opp-wizard-step.is-active .new-opp-wizard-circle{
          background: #2563eb;
          color: #fff;
        }

        .new-opp-wizard-step.is-done .new-opp-wizard-circle{
          background: #16a34a;
          color: #fff;
        }

        .new-opp-wizard-label{
          font-size: 12px;
          color: #9ca3af;
          font-weight: 500;
          white-space: nowrap;
          text-align: center;
		}

				.new-opp-items-empty-state{
					border:1px dashed #cbd5e1;
					border-radius:16px;
					padding:32px 24px;
					background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);
					text-align:center;
					display:flex;
					flex-direction:column;
					align-items:center;
					gap:12px;
				}
				.new-opp-items-empty-icon{
					width:64px;
					height:64px;
					border-radius:50%;
					display:flex;
					align-items:center;
					justify-content:center;
					background:#e8f1ff;
					color:#1d4ed8;
					font-size:26px;
				}
				.new-opp-items-empty-title{
					font-size:18px;
					font-weight:700;
					color:#0f172a;
				}
				.new-opp-items-empty-text{
					max-width:480px;
					color:#475569;
					line-height:1.5;
				}

        .new-opp-wizard-step.is-active .new-opp-wizard-label{
          color: #2563eb;
          font-weight: 600;
        }

        .new-opp-wizard-step.is-done .new-opp-wizard-label{
          color: #16a34a;
        }

        .new-opp-wizard-connector{
          flex: 1;
          height: 2px;
          background: #e5e7eb;
          margin: 0 10px;
          margin-bottom: 20px;
          transition: background 0.2s;
        }

        .new-opp-wizard-connector.is-done{
          background: #16a34a;
        }

        .new-opp-wizard-panel{
          display: block;
        }

        .new-opp-wizard-panel.d-none{
          display: none !important;
        }

        .new-opp-wizard-footer{
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding: 0 2px;
        }

        .new-opp-wizard-nav{
          display: flex;
          gap: 10px;
          align-items: center;
        }

        @media (max-width: 768px){
          .new-opp-wizard-bar{
            flex-wrap: wrap;
            gap: 8px;
          }
          .new-opp-wizard-connector{
            display: none;
          }
          .new-opp-row.two-col{
            grid-template-columns: 1fr;
          }

          .new-opp-row.three-col{
            grid-template-columns: 1fr;
          }

		  .new-opp-row.four-col{
			grid-template-columns: 1fr;
		  }

					.new-opp-inline-type-grid{
						grid-template-columns: 1fr;
					}
        }
      </style>

      <!-- LIST VIEW -->
      <div class="quotation-list-list customer-order-forms-list">
        <div class="row">
          <div class="col-12">
            <div class="page-title-head d-flex align-items-center">
              <div class="flex-grow-1">
                <h3 class="fs-xl fw-bold m-0">Customer Order Forms</h3>
              </div>
              <div class="text-end">
                <ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
                  <li class="breadcrumb-item"><a href="javascript:void(0);">CRM</a></li>
                  <li class="breadcrumb-item active">Customer Order Forms</li>
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
									<select id="filterStatus" class="control-select placeholder" data-table-filter="status" aria-label="Status">
										<option value="">status</option>
										<option value="Draft">Draft</option>
										<option value="Waiting For Approval">Waiting For Approval</option>
										<option value="Approved">Approved</option>
										<option value="Rejected">Rejected</option>
										<option value="Pending Sales Order">Pending Sales Order</option>
										<option value="Pending Purchase Order">Pending Purchase Order</option>
										<option value="Pending Client Input">Pending Client Input</option>
										<option value="Waiting For Payment">Waiting For Payment</option>
										<option value="Pending Inward Material">Pending Inward Material</option>
										<option value="Pending Customer Invoice">Pending Customer Invoice</option>
										<option value="Duplicate">Duplicate</option>
										<option value="Closed">Closed</option>
									</select>

                  <div class="customer-dropdown-wrapper">
                    <input
                      type="text"
                      id="filterCustomer"
                      class="control-select list-filter-customer"
                      data-table-filter="customer"
                      placeholder="customer"
                      aria-label="Customer"
                      autocomplete="off"
                    />
                    <div id="customer-dropdown" class="customer-dropdown">
                      <div id="customer-options-dropdown"></div>
                    </div>
                  </div>

                  

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
                    <button id="opp-filter-button" class="btn btn-default btn-sm filter-button" title="Filters">
											<svg class="es-icon es-line icon-sm"><use href="#es-line-filter"></use></svg>
                      <span id="opp-filter-button-label" class="button-label">Filters</span>
										</button>
										<button class="btn btn-default btn-sm filter-x-button" title="Clear filters">
											<svg class="es-icon es-line icon-sm"><use href="#es-small-close"></use></svg>
										</button>
									</div>
                  <!-- Optional: add advanced filter popover button, actions, or new -->
                  <a id="new-customer-order-form-btn" href="/app/customer-order-forms/new" class="btn btn-sm btn-primary1 mr-2">
                    <i class="fa fa-plus me-1"></i> New Customer Order Form
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
                    
                    <th title="Amount">Amount</th>
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
<div class="quotation-list-details customer-order-forms-details d-none">
  <style>
    .quotation-list-details {
      all: initial;
      display: block !important;
      width: 100% !important;
      background: #f4f6f8 !important;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji" !important;
      color: #1c1f23 !important;
    }

    .quotation-list-details.d-none {
      display: none !important;
    }

    .quotation-list-details * {
      box-sizing: border-box;
    }

    :root{
      --bg: #f4f6f8;
      --panel: #ffffff;
      --text: #1c1f23;
      --muted: #666666;
      --line: #e0e0e0;
      --primary: #0d6efd;
      --success: #22c55e;
      --danger: #ef4444;
      --radius: 10px;
      --radius-sm: 8px;
      --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.08);
      --shadow-card: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .detail-view-wrapper{
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
      gap: 20px;
      padding: 18px;
      background: var(--bg);
      min-height: 100vh;
      width: 100% !important;
    }
    
    @media (max-width: 1100px){
      .detail-view-wrapper{ grid-template-columns: 1fr; }
      .detail-panel{ order: -1; }
    }
    
    .detail-content{ display: flex !important; flex-direction: column; gap: 14px; min-width: 0; }

    .detail-card{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      padding: 18px;
      margin-bottom: 0;
      min-width: 0;
    }

    .detail-card--fullwidth{
      width: 100%;
      margin-right: 0;
      max-width: none;
    }

    .detail-card--lineitems{
      width: calc(100% + var(--line-items-extra, 0px));
      margin-right: calc(var(--line-items-extra, 0px) * -1);
      margin-top: var(--line-items-shift, 0px);
      max-width: none;
    }

    .comments-card{
      width: calc(100% + var(--line-items-extra, 0px));
      margin-right: calc(var(--line-items-extra, 0px) * -1);
      max-width: none;
    }

    @media (max-width: 1100px){
      .detail-card--fullwidth{
        width: 100%;
        margin-right: 0;
      }

      .detail-card--lineitems{
        width: 100%;
        margin-right: 0;
        margin-top: 0;
      }

      .comments-card{
        width: 100%;
        margin-right: 0;
      }
    }
    
    .detail-card:last-child{ margin-bottom: 0; }
    
    .card__title{
      font-weight: 700;
      margin-bottom: 12px;
      font-size: 15px;
      color: var(--text);
    }
    
    .with-link{
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .muted{ color: var(--muted); }
    .small{ font-size: 12px; }
    .mt-8{ margin-top: 8px; }
    
    .brand{
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      margin-bottom: 0;
      width: 100%;
      flex-wrap: wrap;
    }

    .brand-summary{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .brand-left{
      min-width: 0;
      flex: 1;
    }
    
    .brand__dot{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #111;
    }
    
    .brand__name{
      font-size: 16px;
      color: var(--text);
      display: inline-block;
      max-width: 420px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
    }

    .detail-customer-edit-btn {
      border: none;
      background: transparent;
      color: #0f766e;
      padding: 0;
      line-height: 1;
      cursor: pointer;
    }

    .detail-customer-edit-btn:hover,
    .detail-customer-edit-btn:focus {
      color: #0d9488;
      outline: none;
    }
    
    .badge{
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 600;
      background: #eef2ff;
      color: #334155;
      border: 1px solid #e5e7eb;
    }
    
    .badge--success{
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }
    
    .deal-id{
      color: var(--muted);
      font-weight: 500;
      display: block;
      margin-top: 8px;
    }
    
    .deal-amount{
      font-weight: 700;
      font-size: 24px;
      color: var(--primary);
      margin-top: 0;
      text-align: right;
      white-space: nowrap;
    }
    
    .info-grid{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .info-grid--2col{
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    
    @media (max-width: 900px){
      .info-grid{ grid-template-columns: 1fr; }
    }
    
    .info-col{ display: grid; gap: 12px; }
    .info-row .label{
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .info-row .label.with-action {
      display: flex;
      font-weight: 600;
      align-items: center;
      gap: 6px;
    }

    #add-contact-btn {
      cursor: pointer;
      font-size: 13px;
      color: #f59e0b;
    }

    #detail-contact-person .contact-entry:hover .delete-contact {
      display: inline-block !important;
    }

    #detail-contact-person .delete-contact {
      display: none;
    }
    .info-row .value{ 
      font-weight: 600; 
      color: var(--text);
    }
    
    .table-wrap{
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow-x: auto;
      overflow-y: auto;
      max-height: 270px;
      position: relative;
    }

    .table-wrap.is-inline-editing{
      overflow-y: visible;
      max-height: none;
    }

    .detail-add-row-wrap{
      margin-top: 8px;
      display: flex;
      justify-content: flex-start;
    }
    
    .detail-table{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      min-width: 1780px;
    }

    .detail-table th:nth-child(1){ width: 280px; }
    .detail-table th:nth-child(2){ width: 150px; }
    .detail-table th:nth-child(3){ width: 110px; }
    .detail-table th:nth-child(4){ width: 140px; }
    .detail-table th:nth-child(5){ width: 140px; }
    .detail-table th:nth-child(6){ width: 120px; }
    .detail-table th:nth-child(7){ width: 130px; }
    .detail-table th:nth-child(8){ width: 120px; }
    .detail-table th:nth-child(9){ width: 70px; }
    .detail-table th:nth-child(10){ width: 130px; }
    .detail-table th:nth-child(11){ width: 110px; }
    .detail-table th:nth-child(12){ width: 130px; }
    .detail-table th:nth-child(13){ width: 120px; }
    .detail-table th:nth-child(14){ width: 70px; }
    .detail-table th:nth-child(15){ width: 130px; }
    .detail-table th:nth-child(16){ width: 110px; }
    
    .detail-table th, .detail-table td{
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      text-align: left;
    }

    @media (max-width: 1536px){
      .detail-table{
        min-width: 1460px;
      }

      .detail-table th, .detail-table td{
        padding: 8px 8px;
      }

      .detail-table th:nth-child(1){ width: 210px; }
      .detail-table th:nth-child(2){ width: 110px; }
      .detail-table th:nth-child(3){ width: 84px; }
      .detail-table th:nth-child(4){ width: 108px; }
      .detail-table th:nth-child(5){ width: 108px; }
      .detail-table th:nth-child(6){ width: 96px; }
      .detail-table th:nth-child(7){ width: 104px; }
      .detail-table th:nth-child(8){ width: 96px; }
      .detail-table th:nth-child(9){ width: 56px; }
      .detail-table th:nth-child(10){ width: 110px; }
      .detail-table th:nth-child(11){ width: 95px; }
      .detail-table th:nth-child(12){ width: 110px; }
      .detail-table th:nth-child(13){ width: 100px; }
      .detail-table th:nth-child(14){ width: 56px; }
      .detail-table th:nth-child(15){ width: 105px; }
      .detail-table th:nth-child(16){ width: 90px; }

      .detail-table th.actions-col,
      .detail-table td.actions-col{
        width: 56px;
        min-width: 56px;
        max-width: 56px;
        padding: 6px 4px;
      }
    }
    
    .detail-table thead th{
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .02em;
      color: var(--muted);
      background: #f9fafb;
      position: sticky;
      top: 0;
      z-index: 2;
      font-weight: 600;
      white-space: nowrap;
      vertical-align: middle;
      /* keep header visible when the table is scrolled horizontally */
      transform: translateX(var(--line-items-scroll, 0px));
    }

    .detail-table thead tr {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #f9fafb;
    }

    
    .detail-table thead th .th-ellipsis{
      display: block;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail-table .actions-col{
      position: sticky;
      right: 0;
      z-index: 2;
      background: #fff;
      box-shadow: -1px 0 0 var(--line);
      text-align: center;
      white-space: nowrap;
      overflow: visible;
    }

    .detail-table thead .actions-col{
      z-index: 4;
      background: #f9fafb;
    }

    .detail-table th.actions-col,
    .detail-table td.actions-col{
      padding: 8px 6px;
      width: 72px;
      min-width: 72px;
      max-width: 72px;
    }
    
    .detail-table thead th:nth-child(3),
    .detail-table thead th:nth-child(4),
    .detail-table thead th:nth-child(5),
    .detail-table tbody td.line-items-center{
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .detail-table tbody tr:last-child td{ border-bottom: none; }
    .detail-table tbody td{
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

		.table-wrap--summary{
			overflow: visible;
			max-height: none;
		}

		.detail-table--summary{
			min-width: 0;
			table-layout: auto;
		}

		.detail-table--summary thead th,
		.detail-table--summary tbody td{
			padding: 10px 12px;
		}

		.detail-table--summary th:nth-child(1),
		.detail-table--summary td:nth-child(1){
			width: 52px;
			min-width: 52px;
			max-width: 52px;
			text-align: center;
		}

		.detail-table--summary th:nth-child(2){ width: 220px; }
		.detail-table--summary th:nth-child(3){ width: 280px; }
		.detail-table--summary th:nth-child(4){ width: 140px; }
		.detail-table--summary th:nth-child(5){ width: 140px; }
		.detail-table--summary th:nth-child(6){ width: 180px; }

		.detail-table--summary thead th .th-ellipsis,
		.detail-table--summary .cell-ellipsis{
			max-width: 100%;
		}

		.detail-single-half{
			width: 50%;
			max-width: 100%;
			min-width: 260px;
		}

		.detail-inline-two-col{
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
			margin-bottom: 10px;
		}

		.detail-inline-three-col{
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
			margin-bottom: 10px;
		}

		.detail-single-third{
			width: calc(33.333% - 8px);
			max-width: 100%;
			min-width: 200px;
		}

		@media (max-width: 900px){
			.detail-single-half{
				width: 100%;
				min-width: 0;
			}

			.detail-single-third{
				width: 100%;
				min-width: 0;
			}

			.detail-inline-two-col,
			.detail-inline-three-col{
				gap: 10px;
			}
		}
		.detail-table tbody tr.new-opp-item-inline-editor > td,
		.detail-table tbody tr.item-inline-edit-row > td{
			white-space: normal;
			overflow: visible;
		}
		.item-inline-header{
			position: sticky;
			top: 0;
			left: 0;
			right: 0;
			z-index: 999;
			background: #fff;
			box-shadow: 0 2px 12px rgba(0,0,0,0.10);
			min-width: 0;
			transform: translateX(var(--line-items-scroll, 0px));
			will-change: transform;
		}

		.detail-table thead th {
			position: relative;
			top: auto;
			transform: none;
		}

		.detail-table thead tr {
			position: relative;
		}


		.new-opp-item-inline-editor-wrap {
			overflow-y: auto;
			overflow-x: auto;
			max-width: 100%;
		}

		.new-opp-item-inline-details-wrap {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
		}

		.new-opp-item-detail-pill {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			padding: 4px 10px;
			border-radius: 999px;
			background: #f8fafc;
			border: 1px solid #e2e8f0;
			white-space: nowrap;
		}

		.item-edit-four-col-row {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 10px;
			width: 100%;
		}

		.item-edit-four-col-field {
			min-width: 0;
		}

		@media (max-width: 1200px) {
			.item-edit-four-col-row {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}
		}

		@media (max-width: 767px) {
			.item-edit-four-col-row {
				grid-template-columns: 1fr;
			}
		}

		.detail-card--lineitems .table-wrap .item-inline-header,
		#new-opp-items-table-wrap .item-inline-header {
			position: sticky;
			top: 0;
			left: 0;
			right: 0;
			transform: translateX(var(--line-items-scroll, 0px));
			z-index: 999;
			background: #fff;
		}

		.item-inline-actions{
			margin-left: auto;
			position: sticky;
			right: 8px;
			z-index: 4;
			background: #fff;
			padding-left: 8px;
			flex-shrink: 0;
			min-width: max-content;
		}
		.item-inline-actions .item-row-save,
		.item-inline-actions .item-row-cancel{
			width: auto;
			min-width: 84px;
			height: 30px;
			padding: 0 10px;
			gap: 6px;
			font-size: 12px;
		}
		.inline-edit-actions-col{
			white-space: normal !important;
			overflow: hidden !important;
			vertical-align: top !important;
			width: 72px !important;
			min-width: 72px !important;
			max-width: 72px !important;
			padding: 6px 4px !important;
		}
		.inline-edit-actions-stack{
			display: flex;
			// flex-direction: column;
			gap: 6px;
			align-items: center;
			min-width: 24px;
			padding-top: 2px;
			width: 100%;
		}
		.inline-edit-actions-stack .btn{
			height: 24px;
			width: 24px;
			padding: 0;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0;
		}
		.inline-edit-actions-stack .item-row-save,
		.inline-edit-actions-stack .item-row-cancel,
		.inline-edit-actions-stack .new-opp-inline-apply,
		.inline-edit-actions-stack .new-opp-inline-cancel{
			width: 24px;
			min-width: 24px;
		}
		@media (max-width: 992px){
			.item-inline-actions{
				position: static;
				right: auto;
				margin-left: auto;
				padding-left: 8px;
			}
			.inline-edit-actions-stack{
				min-width: 24px;
			}
		}
		.item-inline-editor-panel,
		.new-opp-item-inline-editor-wrap{
			height: 420px;
			max-height: 420px;
			overflow-y: auto;
			overflow-x: hidden;
		}
		@media (max-width: 1366px){
			.item-inline-editor-panel,
			.new-opp-item-inline-editor-wrap{
				height: 360px;
				max-height: 360px;
			}
		}
    .detail-table tbody tr[data-editing="1"] td{
      overflow: hidden;
      vertical-align: middle;
    }
		.detail-table tbody tr.is-active-detail-row td{
			background: #eaf4ff !important;
			border-top: 1px solid #bfdbfe;
			border-bottom: 1px solid #bfdbfe;
		}
		.detail-table tbody tr.is-active-detail-row td:first-child{
			border-left: 3px solid #2563eb;
		}
		#new-opp-items-table-body tr.new-opp-item-main-row.is-active-edit-row > td{
			background: #fff6df !important;
			border-top: 1px solid #fcd34d;
			border-bottom: 1px solid #fcd34d;
		}
		#new-opp-items-table-body tr.new-opp-item-main-row.is-active-edit-row > td:first-child{
			border-left: 3px solid #f59e0b;
		}
    .t-right{ text-align: right; }
    .line-item-title .name{ font-weight: 600; color: var(--text); }
    .line-item-title .sub{ font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .line-item-title--editable{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .item-row-edit-btn,
    .item-row-save,
    .item-row-cancel{
      border: 1px solid var(--line);
      background: #fff;
      color: #475569;
      border-radius: 6px;
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .item-row-save{ color: #16a34a; }
    .item-row-cancel{ color: #dc2626; }
    .item-row-edit-btn:hover,
    .item-row-save:hover,
    .item-row-cancel:hover{
      background: #f8fafc;
    }
	   .item-row-delete-btn{
	  border: 1px solid var(--line);
	  background: #fff;
	  }
    .item-edit-input{
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 3px 6px;
      min-height: 30px;
      min-width: 0;
      box-sizing: border-box;
      background: #fff;
      color: var(--text);
    }
    .item-edit-qty{
      min-width: 0;
      width: 100%;
      max-width: 100%;
      text-align: right;
    }
		.item-edit-rate,
		.item-edit-rate-value{
      min-width: 72px;
      text-align: right;
    }
		.item-code-link-control,
		.item-code-link-control .frappe-control,
		.item-code-link-control .form-group,
		.item-code-link-control .clearfix,
		.item-code-link-control .control-input-wrapper,
		.item-code-link-control .control-input{
      width: 100%;
			margin-bottom: 0 !important;
			padding-bottom: 0 !important;
		  min-width: 0 !important;
		  overflow: hidden !important;
    }
		.item-code-link-control .control-label{ display: none !important; }
    .item-code-link-control .control-input{
			min-height: 38px;
		  border-radius: 6px;
    }
    .item-code-link-control .awesomplete{
      width: 100%;
		  display: block !important;
		  overflow: hidden !important;
    }
		.item-code-link-control .awesomplete > input{
			min-height: 38px !important;
			height: 38px !important;
		  width: 100% !important;
		  max-width: 100% !important;
		  min-width: 0 !important;
		  overflow: hidden !important;
		  text-overflow: ellipsis;
		  white-space: nowrap;
		  padding-right: 28px !important;
		}
		.item-code-link-control .link-btn{
		  right: 8px !important;
		}
    .item-code-link-control .awesomplete > ul{
      z-index: 12;
      max-height: 220px;
      overflow-y: auto;
    }
    .inline-link-portal-list{
      position: fixed !important;
      z-index: 1400 !important;
      background: #ffffff !important;
      border: 1px solid #d1d5db !important;
      border-radius: 8px !important;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16) !important;
      opacity: 1 !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      list-style: none !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      font-size: 14px !important;
      padding: 4px 0 4px 4px !important;
      scrollbar-gutter: stable !important;
      overflow-y: auto !important;
    }
    .inline-link-portal-list:empty,
    .inline-link-portal-list[hidden]{
      display: none !important;
    }
    .inline-link-portal-list > li,
    .inline-link-portal-list > li mark{
      background: #ffffff !important;
      color: #111827 !important;
      opacity: 1 !important;
    }
    .inline-link-portal-list > li{
      padding: 6px 16px 6px 10px !important;
      line-height: 1.35 !important;
      border: 0 !important;
      white-space: normal !important;
      cursor: pointer !important;
    }
    .inline-link-portal-list > li[aria-selected="true"],
    .inline-link-portal-list > li:hover{
      background: #eef2ff !important;
      color: #1e3a8a !important;
    }
		.item-edit-status-control .frappe-control,
    .item-edit-opportunity-type-control .frappe-control,
    .item-edit-renewal-id-control .frappe-control,
		.item-edit-status-control .control-input-wrapper,
    .item-edit-opportunity-type-control .control-input-wrapper,
    .item-edit-renewal-id-control .control-input-wrapper,
		.item-edit-status-control .control-input,
    .item-edit-opportunity-type-control .control-input,
    .item-edit-renewal-id-control .control-input,
		.item-edit-status-control .awesomplete,
    .item-edit-opportunity-type-control .awesomplete,
    .item-edit-renewal-id-control .awesomplete{
      width: 100%;
      min-width: 100%;
    }
		.item-edit-status-control .awesomplete > ul,
    .item-edit-opportunity-type-control .awesomplete > ul,
    .item-edit-renewal-id-control .awesomplete > ul{
      z-index: 12;
      max-height: 220px;
      overflow-y: auto;
    }
    .item-inline-actions{
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .cell-ellipsis{
      display: block;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .grid{
      display: grid;
      gap: 24px;
    }
    
    .grid--3{
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .grid--charts{
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
    }

    .analytics-card{
      padding: 16px;
    }

    .analytics-grid{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 8px;
    }

    .analytics-item{
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      padding: 12px;
      min-height: 220px;
      min-width: 0;
    }

    .chart-empty{
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 112px;
      border: 1px dashed var(--line);
      border-radius: 10px;
      background: #f8fafc;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      padding: 10px;
    }

    .analytics-item-title{
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 10px;
    }

    .description-card .description-body{
      min-height: 96px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      padding: 10px 12px;
      line-height: 1.5;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .description-editor-wrap textarea{
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      resize: vertical;
      min-height: 120px;
      color: var(--text);
      background: #fff;
    }

    .description-editor-actions{
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    
    @media (max-width: 1100px){ .grid--3{ grid-template-columns: 1fr 1fr; } }
    @media (max-width: 700px){ .grid--3{ grid-template-columns: 1fr; } }
    @media (max-width: 900px){ .grid--charts{ grid-template-columns: 1fr; } }
    @media (max-width: 1100px){ .analytics-grid{ grid-template-columns: 1fr; } }
    
    .chart{
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      min-height: 170px;
    }
    
    .chart--pie .chart__pie{
      position: relative;
      width: 132px;
      height: 132px;
      border-radius: 50%;
      background: conic-gradient(#e5e7eb 0 360deg);
      border: 6px solid #f8fafc;
      flex-shrink: 0;
    }
    
    .chart--donut .donut{
      position: relative;
      width: 132px;
      height: 132px;
      border-radius: 50%;
      background: conic-gradient(var(--primary) 0 300deg, #e5e7eb 300deg 360deg);
      flex-shrink: 0;
    }
    
    .chart--donut .donut .hole{
      position: absolute;
      inset: 20px;
      background: #fff;
      border-radius: 50%;
      box-shadow: inset 0 0 0 2px #f1f5f9;
    }
    
    .chart__legend{
      font-size: 13px;
      color: var(--text);
      line-height: 1.45;
      min-width: 0;
      width: 100%;
      max-width: 100%;
    }

    #chart-brand-data{
      display: block;
      max-height: 104px;
      overflow-y: auto;
      padding-right: 6px;
    }

    #chart-brand-data > div{
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 4px;
      min-width: 0;
    }

    .chart-scope-note{
      margin-top: 6px;
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      letter-spacing: 0.01em;
      text-transform: uppercase;
    }

    .chart-label-ellipsis{
      display: inline-block;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
    }

    .stage-bars{
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8px;
      min-height: 98px;
      margin-bottom: 8px;
    }

    .stage-donut-wrap{
      width: 100%;
      min-height: 112px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stage-donut{
      width: 108px;
      height: 108px;
      border-radius: 50%;
      position: relative;
    }

    .stage-donut-hole{
      position: absolute;
      inset: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: inset 0 0 0 1px #e5e7eb;
    }

    .stage-funnel-wrap{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      width: 100%;
      min-height: 112px;
      padding: 6px 0;
    }

    .stage-funnel-row{
      position: relative;
      min-height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      clip-path: polygon(0 0, 100% 0, 94% 100%, 6% 100%);
      box-shadow: inset 0 -1px 0 rgba(0,0,0,0.08);
      margin-top: -1px;
    }

    .stage-funnel-row.is-tail{
      min-height: 42px;
      clip-path: polygon(4% 0, 96% 0, 50% 100%);
    }

    .stage-funnel-text{
      position: relative;
      z-index: 2;
      padding: 0 10px;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 1px rgba(0,0,0,0.22);
    }

    .stage-funnel-gloss{
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 45%;
      background: linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0));
      pointer-events: none;
      z-index: 1;
    }

    .stage-funnel-edge{
      position: absolute;
      top: 0;
      bottom: 0;
      left: 6%;
      width: 1px;
      background: rgba(255,255,255,0.35);
      z-index: 1;
      pointer-events: none;
    }

    .stage-funnel-edge--right{
      left: auto;
      right: 6%;
    }

    .stage-funnel-wrap--pyramid .stage-funnel-row:last-child .stage-funnel-edge,
    .stage-funnel-wrap--pyramid .stage-funnel-row:last-child .stage-funnel-edge--right{
      display: none;
    }

    .stage-funnel-wrap--pyramid{
      width: 100%;
      min-height: 120px;
    }

    @media (max-width: 1200px){
      .stage-funnel-text{
        font-size: 11px;
      }
    }

    .stage-bar-col{
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .stage-bar-fill{
      width: 100%;
      max-width: 42px;
      min-height: 6px;
      border-radius: 8px 8px 0 0;
    }

    .stage-bar-label{
      font-size: 11px;
      color: var(--muted);
      text-align: center;
      line-height: 1.2;
    }

    .sales-bars{
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      min-height: auto;
    }

    .sales-amount-list{
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    .sales-amount-item{
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      column-gap: 8px;
      row-gap: 6px;
      padding: 6px 8px;
      border-radius: 8px;
      background: #f8fafc;
    }

    .sales-amount-item.is-active{
      background: #e7ecff;
    }

    .sales-amount-dot{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .sales-amount-name{
      font-size: 12px;
      color: var(--text);
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sales-amount-pill{
      font-size: 12px;
      font-weight: 700;
      color: #3b5bcc;
      background: #eef2ff;
      border-radius: 999px;
      padding: 2px 8px;
      white-space: nowrap;
    }

    .sales-amount-track{
      grid-column: 1 / -1;
      height: 8px;
      background: #e8edf5;
      border-radius: 999px;
      overflow: hidden;
    }

    .sales-amount-fill{
      height: 100%;
      border-radius: 999px;
    }

    .sales-profit-row{
      display: grid;
      grid-template-columns: 48px 1fr auto;
      align-items: center;
      gap: 8px;
    }

    .sales-profit-label{
      font-size: 11px;
      color: var(--muted);
      font-weight: 600;
    }

    .sales-profit-track{
      width: 100%;
      height: 10px;
      border-radius: 999px;
      background: #f1f5f9;
      overflow: hidden;
    }

    .sales-profit-fill{
      height: 100%;
      border-radius: 999px;
    }

    .sales-profit-amount{
      font-size: 11px;
      color: var(--text);
      font-weight: 600;
      white-space: nowrap;
    }

    .line-chart-wrap{
      width: 100%;
      margin-bottom: 8px;
    }

    .line-chart-svg{
      width: 100%;
      height: 108px;
      display: block;
    }

    .line-chart-xlabels{
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: var(--muted);
      margin-top: -2px;
    }

    .line-chart-xlabels span{
      max-width: 48%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #chart-profit-data{
      display: block;
      white-space: normal;
      word-break: break-word;
    }

    /* ===== COMMENTS & ACTIVITY SECTION ===== */
    .comments-card{
      margin-top: 4px;
    }

    .comment-input-section{
      padding: 16px;
      background: #f8fafc;
      border-radius: 12px;
      margin-bottom: 20px;
    }

    .comment-header{
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      align-items: flex-start;
    }

    .avatar{
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      background: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar img{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar.avatar-sm{
      width: 36px;
      height: 36px;
    }

    .comment-input-wrapper{
      flex: 1;
      min-width: 0;
    }

    .comment-input{
      width: 100%;
      min-height: 40px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--text);
      font: inherit;
      outline: none;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }

    .comment-input:empty:before{
      content: attr(data-placeholder);
      color: #9ca3af;
    }

    .comment-input:focus{
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .comment-actions{
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .comment-actions .detail-btn{
      flex: 1;
      font-size: 13px;
    }

    .activity-timeline-section{
      margin-top: 20px;
    }

    .timeline-label{
      font-weight: 600;
      color: var(--text);
      margin-bottom: 16px;
      font-size: 14px;
    }

    .activity-timeline{
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 480px;
      overflow-y: auto;
      padding-right: 6px;
    }

    .timeline-empty{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px 16px;
      color: #9ca3af;
      text-align: center;
    }

    .timeline-empty i{
      font-size: 32px;
      opacity: 0.5;
    }

    .timeline-empty p{
      margin: 0;
      font-size: 13px;
    }

    .timeline-item{
      display: flex;
      gap: 12px;
      padding: 12px;
      background: #f8fafc;
      border-left: 3px solid var(--primary);
      border-radius: 6px;
    }

    .timeline-item-icon{
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 14px;
    }

    .timeline-item-icon.email{
      background: #3b82f6;
    }

    .timeline-item-icon.notification{
      background: #8b5cf6;
    }

    .timeline-item-icon.comment{
      background: #ec4899;
    }

    .timeline-item-content{
      flex: 1;
      min-width: 0;
    }

    .timeline-item-meta{
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
      color: #6b7280;
    }

    .timeline-item-time{
      font-weight: 600;
    }

    .timeline-item-title{
      font-weight: 600;
      color: var(--text);
      margin-bottom: 4px;
      font-size: 13px;
    }

    .timeline-item-body{
      color: #6b7280;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .timeline-item.email-notification{
      border-left-color: #3b82f6;
    }

    .timeline-item.email-notification .timeline-item-icon{
      background: #3b82f6;
    }

    .text-muted{
      color: #9ca3af;
    }

    .chart-profit-row{
      display: flex;
      align-items: flex-start;
      gap: 6px;
      white-space: normal;
    }

    .chart-profit-label{
      font-weight: 600;
      color: var(--text);
      margin-bottom: 2px;
    }

    .chart-profit-value{
      color: #475569;
      font-size: 12px;
    }
    
    .dot{
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: middle;
    }
    
    .dot--a{ background: #60a5fa; }
    .dot--b{ background: #22c55e; }
    .dot--c{ background: #f59e0b; }
    .dot--primary{ background: var(--primary); }
    
    .searchbox{
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      background: #fff;
    }
    
    .searchbox input{
      border: none !important;
      outline: none;
      background: transparent !important;
      flex: 1;
      font: inherit;
      color: var(--text);
      padding: 0 !important;
    }
    
    .searchbox input::placeholder {
      color: var(--muted);
    }
    
    .search-icon{ opacity: .7; }
    .pill-row{
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    
    .pill{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #1f2937;
      border: 1px solid #e5e7eb;
      cursor: pointer;
    }
    
    .tabs{
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    
    .tab{
      padding: 6px 10px;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 999px;
      font-weight: 600;
      color: #374151;
      cursor: pointer;
      font-size: 14px;
    }
    
    .tab.is-active{
      background: #eef2ff;
      border-color: #c7d2fe;
      color: #3730a3;
    }
    
    .form{
      display: grid;
      gap: 12px;
    }
    
    .form.two-col{
      grid-template-columns: 1fr 1fr;
    }
    
    .form .full{
      grid-column: 1 / -1;
    }
    
    .form-row{
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .form-row label{
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
    }
    
    .form-row input, .form-row textarea{
      border: 1px solid var(--line) !important;
      border-radius: 10px !important;
      padding: 10px 12px !important;
      background: #fff !important;
      color: var(--text) !important;
      font: inherit !important;
    }
    
    .form-row textarea{
      min-height: 96px;
      resize: vertical;
    }
    
    .form-actions{
      display: flex;
      gap: 8px;
    }
    
    .detail-btn{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 10px;
      padding: 10px 14px;
      border: 1px solid transparent;
      background: #f3f4f6;
      cursor: pointer;
      font-weight: 600;
      color: var(--text);
      font-size: 14px;
    }
    
    .detail-btn--primary{
      background: #111827;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      border: none;
    }
    
    .detail-btn--primary:hover{
      background: #1f2937;
    }
    
    .detail-btn--full{
      width: 100%;
    }
    
    .detail-panel{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      padding: 16px;
      display: flex;
      flex-direction: column;
      height: fit-content;
      min-height: 0;
      max-height: calc(100vh - 92px);
      position: sticky;
      top: 70px;
      overflow: auto;
    }
    
    .panel__tabs{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    
    .ptab{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }

    .ptab__icon{
      flex: 0 0 auto;
      font-size: 11px;
      line-height: 1;
    }

    .ptab__label{
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .ptab.is-active{
      border-color: #c7d2fe;
      background: #eef2ff;
      color: #3730a3;
    }
    
    .panel__section{
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    
    .panel__subtitle{
      font-weight: 600;
      color: var(--text);
    }
    
    .panel__section label {
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
    }
    
    .panel__input{
      width: 100%;
      border: 1px solid var(--line) !important;
      border-radius: 10px;
      padding: 10px 12px;
      min-height: 40px;
      background: #fff;
      color: var(--text);
      font: inherit;
    }

    .panel__input:focus{
      outline: none;
      border-color: var(--primary) !important;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
    }

    /* ===== PANEL HEADER WITH CREATE BUTTON ===== */
    .panel__header{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }

    .btn-panel-create{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--primary);
      background: var(--primary);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-panel-create:hover{
      background: #2563eb;
      border-color: #2563eb;
    }

    .btn-panel-create i{
      font-size: 10px;
    }

    /* ===== PANEL CARDS SECTION ===== */
    .panel__cards{
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: calc(100vh - 260px);
      min-height: 180px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .panel__cards > .muted{
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 120px;
      font-size: 13px;
    }

    .empty-state{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 120px;
      border: 1px dashed var(--line);
      border-radius: 10px;
      background: #f8fafc;
      color: var(--muted);
      text-align: center;
      padding: 14px;
    }

    .empty-state i{
      font-size: 15px;
      opacity: 0.7;
    }

    .empty-state__title{
      color: var(--text);
      font-weight: 600;
      font-size: 13px;
      margin: 0;
    }

    .empty-state__desc{
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }

    .panel-card{
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.2s;
      height: 120px;
      display: flex;
      flex-direction: column;
    }

    .panel-card:hover{
      background: #eef2f7;
      border-color: var(--primary);
    }

    .panel-card-header{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      flex-shrink: 0;
    }

    .panel-card-title{
      font-weight: 600;
      font-size: 13px;
      color: var(--text);
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .panel-card-date{
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .panel-card-body{
      font-size: 12px;
      color: #6b7280;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-height: 0;
    }

    .panel-card-meta{
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: auto;
      padding-top: 8px;
      font-size: 11px;
      color: var(--muted);
      flex-shrink: 0;
    }

    .panel-card-meta i{
      font-size: 10px;
    }

    .panel-card-meta--call{
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      margin-top: 0;
      padding-top: 0;
      flex: 1;
      min-height: 0;
      color: var(--muted);
    }

    .call-card-row{
      min-width: 0;
    }

    .call-card-row--title{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .call-card-row--title .panel-card-title{
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .call-card-row--time,
    .call-card-row--sales{
      font-size: 11px;
    }

    .call-card-row--desc{
      margin-top: 2px;
      -webkit-line-clamp: 2;
    }

    .call-meta-item{
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--muted);
      line-height: 1.2;
    }

    .call-status-pill{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid transparent;
      line-height: 1.2;
      white-space: nowrap;
    }

    .call-status-pill.is-scheduled{
      background: #eef2ff;
      color: #4338ca;
      border-color: #c7d2fe;
    }

    .call-status-pill.is-held{
      background: #dcfce7;
      color: #166534;
      border-color: #bbf7d0;
    }

    .call-status-pill.is-cancelled{
      background: #fee2e2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .call-status-pill.is-not-responding{
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }

    .call-status-pill.is-default{
      background: #f1f5f9;
      color: #334155;
      border-color: #e2e8f0;
    }

    /* ===== PANEL FORM SECTION ===== */
    .panel__form{
      display: flex;
      flex-direction: column;
      gap: 0;
      flex: 1;
      min-height: 0;
    }

    .panel__form.d-none{
      display: none !important;
    }

    .panel__form-header{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
      flex-shrink: 0;
    }

    .panel__form-title{
      font-weight: 600;
      font-size: 14px;
      color: var(--text);
    }

    .panel__form-body{
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
      padding-right: 4px;
      padding-bottom: 14px;
      margin-bottom: 0;
    }

    #panel-form-section.panel--appointment-mode .panel__form-body,
    #panel-form-section.panel--call-mode .panel__form-body{
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      padding-right: 12px;
    }

    #panel-form-section.panel--appointment-mode .panel-appointment-fields,
    #panel-form-section.panel--call-mode .panel-call-fields{
      background: transparent;
      border: none;
      padding: 0;
    }

    #panel-form-section.panel--appointment-mode .panel__form-footer,
    #panel-form-section.panel--call-mode .panel__form-footer{
      background: #f8fafc;
      border-top-color: var(--line);
      border-radius: 0 0 10px 10px;
    }

    .note-row{
      display: flex;
      align-items: flex-start;
      gap: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      transition: background-color 0.18s ease;
    }

    .note-row:hover{
      background: #f8fafc;
    }

    .note-avatar{
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #cfead8;
      color: #1f2937;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      flex: 0 0 28px;
    }

    .note-main{
      flex: 1;
      min-width: 0;
    }

    .note-meta{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .note-owner{
      font-weight: 600;
      color: var(--text);
      font-size: 13px;
    }

    .note-date{
      color: #6b7280;
      font-size: 12px;
    }

    .note-content{
      color: var(--text);
      font-size: 14px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .note-actions{
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-left: 4px;
      margin-top: 2px;
      flex: 0 0 auto;
    }

    .note-action-btn{
      border: none;
      background: transparent;
      color: #6b7280;
      width: 20px;
      height: 20px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 4px;
    }

    .note-action-btn:hover{
      color: #111827;
      background: #e5e7eb;
    }

    .panel__field{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .panel__field--grow{
      flex: 1;
      min-height: 0;
    }

    .panel__field label{
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .panel-call-fields{
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
    }

    .panel-call-fields .panel__field label{
      text-transform: none;
      letter-spacing: 0;
      font-size: 11px;
    }

    .panel-call-fields .panel__input,
    .panel-call-fields .panel__textarea,
    .panel-call-fields select.panel__input{
      min-height: 34px;
      background: #fff;
      border-color: #dbe1ea !important;
      padding: 7px 10px;
      font-size: 12px;
    }

    .panel-call-fields .panel__textarea{
      min-height: 84px;
    }

    .panel-call-fields .panel__row{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .panel-appointment-fields{
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
    }

    .panel-appointment-fields .panel__field label{
      text-transform: none;
      letter-spacing: 0;
      font-size: 11px;
    }

    .panel-appointment-fields .panel__row{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .panel-appointment-fields .panel__input,
    .panel-appointment-fields .panel__textarea,
    .panel-appointment-fields select.panel__input{
      min-height: 34px;
      background: #fff;
      border-color: #dbe1ea !important;
      padding: 7px 10px;
      font-size: 12px;
    }

    .panel-appointment-fields .panel__textarea{
      min-height: 84px;
    }

    .panel-participants-control .form-group,
    .panel-participants-control .control-input,
    .panel-participants-control .control-value,
    .panel-participants-control .awesomplete,
    .panel-participants-control .awesomplete input{
      width: 100%;
      margin: 0;
      font-size: 12px;
    }

    .panel-participants-control .awesomplete input,
    .panel-participants-control input.form-control{
      min-height: 34px;
      border-radius: 10px;
      padding: 6px 10px;
    }

    @media (max-width: 420px){
      .panel-call-fields .panel__row{
        grid-template-columns: 1fr;
      }

      .panel-appointment-fields .panel__row{
        grid-template-columns: 1fr;
      }
    }

    .panel__textarea{
      resize: vertical;
      min-height: 120px;
      padding-top: 10px;
      font-family: inherit;
      line-height: 1.5;
    }

    .panel__field--grow .panel__textarea{
      flex: 1;
      min-height: 200px;
      height: 100%;
    }

    .panel-notes-editor-wrap{
      flex: 1;
      min-height: 220px;
    }

    .panel-notes-editor-wrap .form-group,
    .panel-notes-editor-wrap .control-input{
      height: 100%;
      margin-bottom: 0;
    }

    .panel-notes-editor-wrap .control-label{
      display: none !important;
    }

    .panel-notes-editor-wrap .ql-editor{
      min-height: 180px;
      max-height: 320px;
      overflow-y: auto;
    }

    .panel__form-footer{
      position: sticky;
      bottom: 0;
      z-index: 2;
      background: #fff;
      flex-shrink: 0;
      margin-top: 10px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
      box-shadow: 0 -6px 12px rgba(15, 23, 42, 0.04);
    }

    .btn-panel-close{
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: #fff;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-panel-close:hover{
      background: #fee2e2;
      border-color: #fca5a5;
      color: #dc2626;
    }

    .btn-panel-close i{
      font-size: 12px;
    }

    .panel-person-card{
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 4px solid var(--primary);
      border-radius: 12px;
      padding: 12px;
    }

    .panel-person-head{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 2px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
    }

    .panel-person-head-left{
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .panel-mini-icon{
      width: 28px;
      height: 28px;
      border: 1px solid var(--line);
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      color: var(--muted);
      font-size: 13px;
      flex: 0 0 28px;
    }

    .panel-person-title-wrap{
      min-width: 0;
    }

    .panel-person-name{
      color: var(--primary);
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .panel-person-close{
      border: 1px solid #93c5fd;
      border-radius: 999px;
      width: 28px;
      height: 28px;
      padding: 0;
      background: #dbeafe;
      color: #1e3a8a;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .panel-person-close:hover,
    .panel-person-close:focus{
      background: #bfdbfe;
      border-color: #60a5fa;
      color: #1e40af;
    }

    .panel-person-item{
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      padding: 10px 12px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .panel-person-item-icon{
      width: 18px;
      display: inline-flex;
      justify-content: center;
      color: var(--muted);
      margin-top: 1px;
      flex: 0 0 18px;
    }

    .panel-person-item-body{
      min-width: 0;
    }

    .panel-person-item-label{
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      margin-bottom: 3px;
    }

    .panel-person-value{
      color: var(--text);
      line-height: 1.35;
      word-break: break-word;
    }

    .detail-page-header {
      padding: 16px 24px 0;
      background: var(--bg);
    }

    .detail-page-header .detail-page-title-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .detail-page-header .detail-page-title-head .title-left {
      flex: 1;
    }

    .detail-page-header .detail-page-title-head .title-right {
      text-align: right;
    }

    .detail-page-header .detail-page-title-head .breadcrumb {
      margin: 0;
      padding: 0;
      background-color: transparent;
      justify-content: flex-end;
    }

    .detail-page-header .ticket-meta {
      border: none;
      border-radius: 0;
      background: transparent;
      padding: 8px 0 0;
      box-shadow: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .detail-page-header .ticket-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-weight: 600;
    }

    .detail-page-header .subject {
      color: var(--primary);
      font-weight: 700;
			display: inline-block;
			max-width: 520px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			vertical-align: bottom;
    }

    .detail-page-header .ticket-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-pdf-print {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #dc2626 !important;
      border-color: #fca5a5 !important;
      background: #fff5f5 !important;
      font-weight: 600;
    }

    .btn-pdf-print:hover,
    .btn-pdf-print:focus {
      background: #fee2e2 !important;
      border-color: #f87171 !important;
      color: #b91c1c !important;
    }

    .btn-followup-check{
      background: #f59e0b !important;
      border-color: #d97706 !important;
      color: #ffffff !important;
      font-weight: 600;
    }

    .btn-followup-check:hover,
    .btn-followup-check:focus{
      background: #d97706 !important;
      border-color: #b45309 !important;
      color: #ffffff !important;
    }

			.btn-submit-quotation{
				background: #16a34a !important;
				border-color: #15803d !important;
				color: #ffffff !important;
				font-weight: 600;
			}

			.btn-submit-quotation:hover,
			.btn-submit-quotation:focus{
				background: #15803d !important;
				border-color: #166534 !important;
				color: #ffffff !important;
			}

    @media (max-width: 900px) {
      .detail-page-header {
        padding: 14px 14px 0;
      }

      .detail-page-header .detail-page-title-head {
        flex-direction: column;
        align-items: flex-start;
      }

      .detail-page-header .detail-page-title-head .title-right {
        text-align: left;
      }

      .detail-page-header .detail-page-title-head .breadcrumb {
        justify-content: flex-start;
      }

      .detail-page-header .ticket-meta {
        flex-direction: column;
        align-items: flex-start;
      }

      .brand-summary {
        flex-direction: column;
        align-items: flex-start;
      }

      .deal-amount {
        text-align: left;
      }
    }

    .opportunities-table .pill{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      min-height: 22px;
      width: auto;
      height: auto;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
    }

    .opportunities-table .pill.open1{
      background: #e0f2fe;
      color: #0369a1;
      border-color: #bae6fd;
    }

    .opportunities-table .pill.pending{
      background: #eef2ff;
      color: #4338ca;
      border-color: #c7d2fe;
    }

    .opportunities-table .pill.resolved{
      background: #dcfce7;
      color: #166534;
      border-color: #bbf7d0;
    }

    .opportunities-table .pill.closed1{
      background: #fee2e2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .opportunities-table .pill.on_hold,
    .opportunities-table .pill.bg-light{
      background: #f1f5f9;
      color: #334155;
      border-color: #e2e8f0;
    }
	#detail-workflow-btn {
		background: linear-gradient(90deg, #2563eb 0%, #3b82f6 100%) !important;
		color: #fff !important;
		border: none !important;
		font-weight: 700;
		box-shadow: 0 2px 8px rgba(59,130,246,0.08);
		transition: background 0.2s;
	}
	#detail-workflow-btn:disabled {
		background: #a5b4fc !important;
		color: #fff !important;
		opacity: 0.7;
	}
	</style>

  <div class="ticket-header detail-page-header">
    <div class="detail-page-title-head">
      <div class="title-left">
        <h3 class="page-title m-0" id="detail-name">Customer Order Form</h3>
      </div>
      <div class="title-right">
        <ol class="breadcrumb">
          <li class="breadcrumb-item"><a href="javascript:void(0)">CRM</a></li>
          <li class="breadcrumb-item"><a href="/app/customer-order-forms">Customer Order Forms</a></li>
        </ol>
      </div>
    </div>

    <div class="ticket-meta mt-3">
      <div class="ticket-title">
        <span id="detail-header-id" class="subject">Subject</span>
        <span class="separator"> </span>
        <span class="badge badge--success" id="detail-status-badge">New</span>
      </div>

      <div class="ticket-actions">
				<button class="btn btn-default2 btn-sm btn-followup-check" id="followup-check-btn" type="button">Follow Up</button>
				<div class="dropdown d-none" id="detail-workflow-dropdown" style="display:inline-block; margin-left:8px;">
					<button class="btn btn-default2 btn-sm dropdown-toggle" id="detail-workflow-btn" type="button" data-bs-toggle="dropdown" disabled>
						Workflow Actions
					</button>
					<ul class="dropdown-menu" id="detail-workflow-menu"></ul>
				</div>
				<button class="btn btn-default2 btn-sm btn-primary" id="connections-btn" type="button">Connections</button>
				<button class="btn btn-default2 btn-sm btn-pdf-print" id="detail-pdf-btn" type="button" title="Download / Print PDF">
					<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
					PDF
				</button>
				<div class="dropdown d-none" id="doc-actions-dropdown">
					<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
						Create
					</button>
					<ul class="dropdown-menu dropdown-menu-end">
						<li><a class="dropdown-item" href="#" data-action="create_customer_order_form">Customer Order Form</a></li>
					</ul>
				</div>
      </div>
    </div>
  </div>

  <div class="detail-view-wrapper">
    <!-- Main Content -->
    <section class="detail-content">
      <!-- Brand & Amount Card -->
      <div class="detail-card">
        <div class="brand-summary">
          <div class="brand-left">
            <div class="brand">
              
              <span class="brand__name" id="detail-customer-name">Customer</span>
              <button type="button" class="detail-customer-edit-btn" id="detail-edit-customer-btn" title="Edit Customer">
                <i class="fa fa-pencil"></i>
              </button>
              
            </div>
            
            <div class="deal-id" id="detail-closure-date">-</div>
          </div>
          <div class="deal-amount" id="detail-amount">₹ 0.00</div>
        </div>
      </div>


		  <!-- Customer Card -->
				<div class="detail-card info-grid-container">
					<div class="card__title">Customer Details</div>
					<div class="info-grid" style="margin-top:10px;">
						
					</div>
					<div class="info-grid info-grid--2col" style="margin-top:10px;">
						<div class="info-col">
							<div class="info-row">
								<span class="label with-action">CONTACT PERSON <i id="add-contact-btn" class="fa fa-plus" title="Add Contact"></i></span>
								<div class="value" id="detail-contact-person">-</div>
							</div>
						</div>
						<div class="info-col">
							<div class="info-row">
								<span class="label">SALES PERSON</span>
								<div class="value" id="detail-sales-team">-</div>
							</div>
						</div>
					</div>
					<div class="info-grid info-grid--2col" style="margin-top:10px;">
						<div class="info-col">
							<div class="info-row">
								<span class="label">CUSTOMER ADDRESS</span>
								<div class="value"><span class="detail-address-name" id="detail-customer-address-name">-</span></div>
							</div>
						</div>
						<div class="info-col">
							<div class="info-row">
								<span class="label">SHIPPING ADDRESS</span>
								<div class="value"><span class="detail-address-name" id="detail-shipping-address-name">-</span></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Company Card -->
				<div class="detail-card info-grid-container">
					<div class="card__title">Company Details</div>
					<div class="info-grid info-grid--2col">
						<div class="info-col">
							<div class="info-row">
								<span class="label">COMPANY NAME</span>
								<div class="value" id="detail-company-name">-</div>
							</div>
						</div>
						<div class="info-col">
							<div class="info-row">
								<span class="label">COMPANY ADDRESS</span>
								<div class="value"><span class="detail-address-name" id="detail-company-address-name">-</span></div>
							</div>
						</div>
					</div>
					<div class="info-row" style="margin-top:10px;">
						<span class="label">Quotation</span>
						<div class="value" id="detail-opportunity">-</div>
					</div>
					
				</div>







			<!-- Items Card -->
      <div class="detail-card detail-card--fullwidth detail-card--lineitems">
        <div class="d-flex align-items-center justify-content-between mb-2">
					<div class="card__title m-0">Items</div>
        </div>
        <div class="table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th><span class="th-ellipsis" title="Item Name">Item Name</span></th>
                <th><span class="th-ellipsis" title="Brand">Brand</span></th>
                <th><span class="th-ellipsis" title="Qty">Qty</span></th>
                <th><span class="th-ellipsis" title="Price">Price</span></th>
                <th><span class="th-ellipsis" title="Amount">Amount</span></th>
				<th><span class="th-ellipsis" title="Status">Status</span></th>
                <th><span class="th-ellipsis" title="Opportunity Type">Opportunity Type</span></th>
                <th><span class="th-ellipsis" title="Renewal ID">Renewal ID</span></th>
                <th><span class="th-ellipsis" title="ORC">ORC</span></th>
                <th><span class="th-ellipsis" title="Commission Type">Commission Type</span></th>
                <th><span class="th-ellipsis" title="Rate Value">Rate Value</span></th>
                <th class="actions-col line-items-center"><span class="th-ellipsis" title="Edit">Edit</span></th>
              </tr>
            </thead>
            <tbody id="detail-items-tbody">
			  <tr>
				<td colspan="12" class="muted">No line items</td>
			  </tr>
            </tbody>
          </table>
        </div>
        <div class="detail-add-row-wrap">
					<div class="dropdown" id="detail-add-item-actions">
						<button type="button" class="btn btn-dark btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
						<ul class="dropdown-menu">
							<li><a class="dropdown-item" href="#" id="detail-add-item-row-action">Add New Item</a></li>
							<li><a class="dropdown-item" href="#" id="detail-add-item-row-renewal">Add Renewal Item</a></li>
							<li><a class="dropdown-item" href="#" id="detail-add-item-row-additional">Add Additional Item</a></li>
						</ul>
					</div>
        </div>
				<div id="detail-item-wizard-inline-section" class="new-opp-item-wizard-inline-section d-none">
					<div class="new-opp-item-wizard-inline-header">
						<div class="new-opp-item-wizard-inline-title">Item Wizard</div>
						<div class="new-opp-item-wizard-inline-subtitle">Fill details and save to add or update the row in the table.</div>
					</div>
					<div id="detail-item-wizard-inline-body" class="new-opp-item-wizard-inline-body"></div>
				</div>
        <datalist id="item-code-suggestions"></datalist>
      </div>

			<!-- Taxes Card -->
			<div class="detail-card detail-card--fullwidth detail-card--lineitems">
				<div class="d-flex align-items-center justify-content-between mb-2">
					<div class="card__title m-0">Taxes</div>
					<button type="button" class="btn btn-default2 btn-sm" id="detail-taxes-toggle-btn">Show Table</button>
        </div>
				<div class="detail-inline-three-col">
					<div class="new-opp-field detail-single-third" style="margin-top:0;">
						<label>Tax Category</label>
						<div id="detail-tax-category" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">-</div>
					</div>
					<div class="new-opp-field detail-single-third" style="margin-top:0;">
						<label>Sales Taxes and Charges Template</label>
						<div id="detail-taxes-template" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">-</div>
					</div>
					<div class="new-opp-field detail-single-third" style="margin-top:0;">
						<label>Total Taxes and Charges</label>
						<div id="detail-taxes-total" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">${fmtCurrency(0)}</div>
					</div>
				</div>
				<div class="table-wrap table-wrap--summary d-none" id="detail-taxes-table-wrap">
					<table class="detail-table detail-table--summary">
						<thead>
							<tr>
								<th><span class="th-ellipsis" title="No.">No.</span></th>
								<th><span class="th-ellipsis" title="Type">Type</span></th>
								<th><span class="th-ellipsis" title="Account Head">Account Head</span></th>
								<th><span class="th-ellipsis" title="Tax Rate">Tax Rate</span></th>
								<th><span class="th-ellipsis" title="Amount">Amount</span></th>
								<th><span class="th-ellipsis" title="Total">Total</span></th>
							</tr>
						</thead>
						<tbody id="detail-taxes-tbody">
							<tr><td colspan="6" class="muted">No taxes</td></tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- Payment Terms Card -->
			<div class="detail-card detail-card--fullwidth detail-card--lineitems">
				<div class="d-flex align-items-center justify-content-between mb-2">
					<div class="card__title m-0">Payment Terms</div>
				</div>
				<div class="new-opp-field detail-single-half" style="margin-bottom:10px;">
					<label>Payment Terms Template</label>
					<div id="detail-payment-terms-template" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">-</div>
				</div>
				<div class="table-wrap table-wrap--summary">
					<table class="detail-table detail-table--summary">
						<thead>
							<tr>
								<th><span class="th-ellipsis" title="No.">No.</span></th>
								<th><span class="th-ellipsis" title="Payment Term">Payment Term</span></th>
								<th><span class="th-ellipsis" title="Description">Description</span></th>
								<th><span class="th-ellipsis" title="Due Date">Due Date</span></th>
								<th><span class="th-ellipsis" title="Invoice Portion">Invoice Portion (%)</span></th>
								<th><span class="th-ellipsis" title="Payment Amount">Payment Amount (INR)</span></th>
							</tr>
						</thead>
						<tbody id="detail-payment-terms-tbody">
							<tr><td colspan="6" class="muted">No payment terms</td></tr>
						</tbody>
					</table>
				</div>
				<div class="new-opp-field detail-single-half" style="margin-top:10px;">
					<label>Total Scheduled Amount</label>
					<div id="detail-payment-terms-total" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">${fmtCurrency(0)}</div>
				</div>
			</div>

			<!-- Terms & Conditions Card -->
			<div class="detail-card detail-card--fullwidth detail-card--lineitems description-card">
				<div class="d-flex align-items-center justify-content-between mb-2">
					<div class="card__title m-0">Terms &amp; Conditions</div>
				</div>
				<div class="new-opp-field detail-single-half" style="margin-bottom:10px;">
					<label>TC Name</label>
					<div id="detail-terms-template-name" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">-</div>
				</div>
				<div id="detail-terms-and-conditions" class="description-body muted">No terms and conditions</div>
      </div>
    </section>

    <!-- Right Panel -->
    <aside class="detail-panel">
      <div class="panel__tabs">
      <button class="ptab is-active" data-type="Notes" title="Notes"><span class="ptab__icon">📝</span><span class="ptab__label">Notes</span></button>
        <button class="ptab " data-type="Call" title="Call"><span class="ptab__icon">📞</span><span class="ptab__label">Call</span></button>
        <button class="ptab" data-type="Appointment" title="Appointment"><span class="ptab__icon">📅</span><span class="ptab__label">Appointment</span></button>
        
        <button class="ptab" data-type="Email" title="Email"><span class="ptab__icon">📧</span><span class="ptab__label">Email</span></button>
      </div>

      <!-- Panel Header with Create Button -->
      <div class="panel__header">
        <div class="panel__subtitle">Recent Calls</div>
        <button class="btn-panel-create" id="btn-panel-create">
          <i class="fa fa-plus"></i> Create
        </button>
      </div>

      <!-- Cards Section (default view) -->
      <div class="panel__cards" id="panel-cards-section">
        <div class="empty-state">
          <i class="fa fa-phone"></i>
          <p class="empty-state__title">No Calls</p>
          <p class="empty-state__desc">Recent call activities will appear here.</p>
        </div>
      </div>

      <!-- Form Section (hidden by default) -->
      <div class="panel__form d-none" id="panel-form-section">
        <div class="panel__form-header">
          <div class="panel__form-title">New Call</div>
          <button class="btn-panel-close" id="btn-panel-close">
            <i class="fa fa-times"></i>
          </button>
        </div>

        <div class="panel__form-body">
          <div id="panel-call-fields" class="panel-call-fields d-none">
            <div class="panel__field">
              <label>Subject</label>
              <input type="text" class="panel__input" id="panel-call-subject" placeholder="Call subject" />
            </div>

            <div class="panel__field">
              <label>Status</label>
              <select class="panel__input" id="panel-call-status">
                <option value="Scheduled">Scheduled</option>
                <option value="Held">Held</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Not Responding">Not Responding</option>
              </select>
            </div>

            <div class="panel__row">
              <div class="panel__field">
                <label>Start Date</label>
                <input type="date" class="panel__input" id="panel-call-start-date" />
              </div>

              <div class="panel__field">
                <label>Start Time</label>
                <input type="time" class="panel__input" id="panel-call-start-time" />
              </div>
            </div>

            <div class="panel__row">
              <div class="panel__field">
                <label>End Date</label>
                <input type="date" class="panel__input" id="panel-call-end-date" />
              </div>

              <div class="panel__field">
                <label>End Time</label>
                <input type="time" class="panel__input" id="panel-call-end-time" />
              </div>
            </div>

            <div class="panel__row">
              <div class="panel__field">
                <label>Related To</label>
                <select class="panel__input" id="panel-call-related-to">
                  <option value="">Select</option>
                  <option value="Customer">Customer</option>
                  <option value="Contact">Contact</option>
                </select>
              </div>

              <div class="panel__field">
                <label>Name1</label>
                <input type="text" class="panel__input" id="panel-call-name1" placeholder="Customer / Contact" />
              </div>
            </div>

            <div class="panel__field panel__field--grow">
              <label>Description</label>
              <textarea class="panel__input panel__textarea" id="panel-call-description" rows="6" placeholder="Description"></textarea>
            </div>

            <div class="panel__field">
              <label>Sales Team</label>
              <input type="text" class="panel__input" id="panel-call-sales-team" placeholder="Sales Person" />
            </div>
          </div>

          <div id="panel-appointment-fields" class="panel-appointment-fields d-none">
            <div class="panel__field">
              <label>Appointment With</label>
              <select class="panel__input" id="panel-appointment-with">
                <option value="Customer">Customer</option>
                <option value="Lead">Lead</option>
              </select>
            </div>

            <div class="panel__field">
              <label>Party</label>
              <input type="text" class="panel__input" id="panel-party" placeholder="Party" />
            </div>

            <div class="panel__field">
              <label>Customer Name</label>
              <input type="text" class="panel__input" id="panel-customer-name" placeholder="Customer Name" />
            </div>

            <div class="panel__row">
              <div class="panel__field">
                <label>Customer Phone Number</label>
                <input type="text" class="panel__input" id="panel-customer-phone-number" placeholder="Phone Number" />
              </div>

              <div class="panel__field">
                <label>Customer Email</label>
                <input type="email" class="panel__input" id="panel-customer-email" placeholder="user@example.com" />
              </div>
            </div>

            <div class="panel__field">
              <label>Custom Participants</label>
              <div id="panel-custom-participants-control" class="panel-participants-control"></div>
            </div>

            <div class="panel__row">
              <div class="panel__field">
                <label>Custom Start Date</label>
                <input type="date" class="panel__input" id="panel-custom-start-date" />
              </div>

              <div class="panel__field">
                <label>Custom Start Time</label>
                <input type="time" class="panel__input" id="panel-custom-start-time" />
              </div>
            </div>

            <div class="panel__row">
              <div class="panel__field">
                <label>Custom End Date</label>
                <input type="date" class="panel__input" id="panel-custom-end-date" />
              </div>

              <div class="panel__field">
                <label>Custom End Time</label>
                <input type="time" class="panel__input" id="panel-custom-end-time" />
              </div>
            </div>

            <div class="panel__field">
              <label>Scheduled Time</label>
              <input type="datetime-local" class="panel__input" id="panel-scheduled-time" />
            </div>

            <div class="panel__field panel__field--grow">
              <label>Customer Details</label>
              <textarea class="panel__input panel__textarea" id="panel-customer-details" rows="6" placeholder="Customer Details"></textarea>
            </div>
          </div>

          <div class="panel__field">
            <label>Date / Time</label>
            <input type="datetime-local" class="panel__input" id="panel-datetime" />
          </div>

          <div class="panel__field">
            <label>Assignee / Owner</label>
            <input type="email" class="panel__input" id="panel-assignee" placeholder="user@example.com" />
          </div>

          <div class="panel__field panel__field--grow">
            <label>Notes</label>
            <textarea class="panel__input panel__textarea" id="panel-notes" rows="8" placeholder="Notes"></textarea>
            <div id="panel-notes-editor-wrap" class="panel-notes-editor-wrap d-none">
              <div id="panel-notes-editor"></div>
            </div>
          </div>
        </div>

        <div class="panel__form-footer">
          <button class="detail-btn detail-btn--primary detail-btn--full" id="panel-save-btn">Save</button>
        </div>
      </div>
    </aside>
  </div>

</div>

      <!-- NEW VIEW -->
      <div class="quotation-list-new customer-order-forms-new d-none">
        <div class="new-opportunity-wrap">

          <!-- Wizard Step Bar -->
          <div class="new-opp-wizard-bar">
            <div class="new-opp-wizard-step is-active" data-step="1">
              <div class="new-opp-wizard-circle">1</div>
              <div class="new-opp-wizard-label">Basic Info</div>
            </div>
            <div class="new-opp-wizard-connector"></div>
            <div class="new-opp-wizard-step" data-step="2">
              <div class="new-opp-wizard-circle">2</div>
							<div class="new-opp-wizard-label">Contacts &amp; Address</div>
            </div>
            <div class="new-opp-wizard-connector"></div>
            <div class="new-opp-wizard-step" data-step="3">
              <div class="new-opp-wizard-circle">3</div>
              <div class="new-opp-wizard-label">Items</div>
            </div>
            <div class="new-opp-wizard-connector"></div>
            <div class="new-opp-wizard-step" data-step="4">
              <div class="new-opp-wizard-circle">4</div>
							<div class="new-opp-wizard-label">Taxes</div>
						</div>
						<div class="new-opp-wizard-connector"></div>
						<div class="new-opp-wizard-step" data-step="5">
							<div class="new-opp-wizard-circle">5</div>
							<div class="new-opp-wizard-label">Terms &amp; Payment</div>
            </div>
          </div>

          <!-- Step 1: Basic Info -->
          <div class="new-opp-wizard-panel" data-panel="1">
            <div class="new-opportunity-card">
              <div class="card__title">Basic Information</div>
              <div class="new-opportunity-form">
			  <div class="new-opp-field">
					<label>Subject</label>
					<input type="text" id="new-opp-subject" class="form-control" placeholder="Enter subject" />
				</div>
                <div class="new-opp-row two-col">
                  <div class="new-opp-field">
                    <label id="new-opp-party-label">Customer <span style="color:#eb9091">*</span></label>
                    <div id="new-opp-party-name-control" class="new-opp-link-control"></div>
                  </div>
                  <div class="new-opp-field">
                    <label>Company</label>
                    <div id="new-opp-company-control" class="new-opp-link-control"></div>
                  </div>
                </div>

				<div class="new-opp-row two-col">
					<div class="new-opp-field">
						<label>Transaction Date <span style="color:#eb9091">*</span></label>
						<input type="date" id="new-opp-transaction-date" class="form-control" />
					</div>
					<div class="new-opp-field">
						<label>Valid Till <span style="color:#eb9091">*</span></label>
						<input type="date" id="new-opp-valid-till" class="form-control" />
					</div>
				</div>
				<div class="new-opp-row two-col">
					<div class="new-opp-field">
						<label>PO Ref Number <span style="color:#eb9091">*</span></label>
						<input type="text" id="new-opp-po-ref-number" class="form-control" placeholder="Enter PO Ref Number" />
					</div>
					<div class="new-opp-field">
						<label>PO Attachment <span style="color:#eb9091">*</span></label>
						<div id="new-opp-po-attachment-control"></div>
					</div>
				</div>

				<div class="new-opp-row two-col">
                  <div class="new-opp-field">
                    <label>Sales Person</label>
                    <div id="new-opp-sales-person-control" class="new-opp-link-control" style="display:none;"></div>
                    <div id="new-opp-sales-person-display" style="margin-top:8px;"></div>
                  </div>
				  <div class="new-opp-field">
                    <div class="new-opp-field">
						<label>Quotation Id <span style="color:#eb9091"></span></label>
						<input type="text" id="new-opp-quotation-id" class="form-control" placeholder="Enter Quotation Id" />
					</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: Contact & Address -->
          <div class="new-opp-wizard-panel d-none" data-panel="2">
            <div class="new-opportunity-card">
              <div class="card__title">Contact &amp; Address</div>
              <div class="new-opportunity-form">
                <div class="new-opp-field">
                  <label class="control-label reqd">Contact Person <span style="color:#eb9091">*</span> <i id="new-opp-contact-quick-add" class="fa fa-plus text-primary ms-1" title="Add Contact"></i></label>
                  <div id="new-opp-contact-display" class="new-opp-contact-list"><span class="new-opp-contact-empty">No contacts added.</span></div>
                </div>
								<div class="card__title" style="margin-top:12px;">Address</div>
								<div class="new-opp-row two-col">
									<div class="new-opp-field">
										<label>Customer Address</label>
										<div id="new-opp-customer-address-control" class="new-opp-link-control"></div>
										<div class="new-opp-field" style="margin-top:8px;">
											<label>Billing Address GSTIN</label>
											<input id="new-opp-billing-address-gstin" type="text" class="form-control" readonly />
										</div>
										<div class="new-opp-field" style="margin-top:8px;">
											<label>Billing Address</label>
											<textarea id="new-opp-billing-address-display" class="form-control" rows="6" readonly></textarea>
										</div>
									</div>
									<div class="new-opp-field">
										<label>Shipping Address</label>
										<div id="new-opp-shipping-address-control" class="new-opp-link-control"></div>
										<div class="new-opp-field" style="margin-top:8px;">
											<label>Shipping Address GSTIN</label>
											<input id="new-opp-shipping-address-gstin" type="text" class="form-control" readonly />
										</div>
										<div class="new-opp-field" style="margin-top:8px;">
											<label>Shipping Address</label>
											<textarea id="new-opp-shipping-address-display" class="form-control" rows="6" readonly></textarea>
										</div>
									</div>
								</div>
								<div class="new-opp-field" style="margin-top:10px;">
									<label>Company Address</label>
									<div id="new-opp-company-address-control" class="new-opp-link-control"></div>
								</div>
								<div class="new-opp-row two-col">
									<div class="new-opp-field">
										<label>Company Address GSTIN</label>
										<input id="new-opp-company-address-gstin" type="text" class="form-control" readonly />
									</div>
									<div class="new-opp-field">
										<label>Company Address Details</label>
										<textarea id="new-opp-company-address-display" class="form-control" rows="6" readonly></textarea>
									</div>
								</div>

								<div class="new-opp-row two-col">
									<div class="new-opp-field">
										<label>Description</label>
										<textarea id="new-opp-description" class="form-control" rows="6"></textarea>
									</div>
								</div>
              </div>
            </div>
          </div>

          <!-- Step 3: Items -->
          <div class="new-opp-wizard-panel d-none" data-panel="3">
            <div class="new-opportunity-card">
              <div class="card__title">Items</div>
              <div class="new-opportunity-form">
                <div class="new-opp-row one-col">
                  <div class="new-opp-field">
					<div id="new-opp-items-empty-state" class="new-opp-items-empty-state">
						<div class="new-opp-items-empty-icon"><i class="fa fa-list-alt"></i></div>
						<div class="new-opp-items-empty-title">Add your first item</div>
						
						<button type="button" class="btn btn-primary1" id="new-opp-add-first-item">Add Item</button>
					</div>
										<div class="table-wrap new-opp-table-wrap d-none" id="new-opp-items-table-wrap">
					  <table class="detail-table">
                        <thead>
                          <tr>
                            <th><span class="th-ellipsis" title="Item Name">Item Name</span></th>
													 
													 <th><span class="th-ellipsis" title="Qty">Qty</span></th>
														<th><span class="th-ellipsis" title="Price">Rate</span></th>
														<th><span class="th-ellipsis" title="Amount">Amount</span></th>
														
														<th class="actions-col line-items-center"><span class="th-ellipsis" title="Edit">Edit</span></th>
                          </tr>
                        </thead>
                        <tbody id="new-opp-items-table-body"></tbody>
                      </table>
                    </div>
					<div class="new-opp-add-row-wrap">
											<div class="dropdown d-none" id="new-opp-add-item-actions">
												<button class="btn btn-dark btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
												<ul class="dropdown-menu">
													<li><a class="dropdown-item" href="#" id="new-opp-add-item">Add New Item</a></li>
													<li><a class="dropdown-item" href="#" id="new-opp-add-item-renewal">Add Renewal Item</a></li>
													<li><a class="dropdown-item" href="#" id="new-opp-add-item-additional">Add Additional Item</a></li>
												</ul>
											</div>
                    </div>
									<div id="new-opp-item-wizard-inline-section" class="new-opp-item-wizard-inline-section d-none">
										<div class="new-opp-item-wizard-inline-header">
											<div class="new-opp-item-wizard-inline-title">Item Wizard</div>
											<div class="new-opp-item-wizard-inline-subtitle">Fill details and save to add or update the row in the table.</div>
										</div>
										<div id="new-opp-item-wizard-inline-body" class="new-opp-item-wizard-inline-body"></div>
									</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

					<!-- Step 4: Taxes -->
          <div class="new-opp-wizard-panel d-none" data-panel="4">
            <div class="new-opportunity-card">
							<div class="card__title">Taxes</div>
              <div class="new-opportunity-form">
								
								<div class="new-opp-field">
									<label>Tax Category</label>
									<div id="new-opp-tax-category-control" class="new-opp-link-control"></div>
								</div>
								<div class="new-opp-field">
									<label>Taxes and Charges Template</label>
									<div id="new-opp-tax-template-control" class="new-opp-link-control"></div>
								</div>
								<div id="new-opp-taxes-preview-wrap" class="new-opp-field d-none" style="margin-top:12px;">
									<label>Sales Taxes and Charges</label>
									<div class="table-wrap new-opp-table-wrap new-opp-preview-table-wrap">
										<table class="detail-table new-opp-preview-table">
											<thead>
												<tr>
													<th><span class="th-ellipsis" title="No.">No.</span></th>
													<th><span class="th-ellipsis" title="Type">Type</span></th>
													<th><span class="th-ellipsis" title="Account Head">Account Head</span></th>
													<th><span class="th-ellipsis" title="Tax Rate">Tax Rate</span></th>
													<th><span class="th-ellipsis" title="Amount">Amount (INR)</span></th>
													<th><span class="th-ellipsis" title="Total">Total (INR)</span></th>
												</tr>
											</thead>
											<tbody id="new-opp-taxes-preview-body"></tbody>
										</table>
									</div>
									<div class="new-opp-field" style="margin-top:10px;">
										<label>Total Taxes and Charges (INR)</label>
										<div id="new-opp-taxes-preview-total" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">${fmtCurrency(0)}</div>
									</div>
								</div>
							</div>
						</div>
					</div>

						<!-- Step 5: Terms & Conditions + Payment Terms -->
					<div class="new-opp-wizard-panel d-none" data-panel="5">
						<div class="new-opportunity-card">
								
							<div class="new-opportunity-form">
									<div class="card__title" style="margin-bottom:12px;">Payment Terms</div>
									<div class="new-opp-field">
										<label>Payment Terms Template</label>
										<div id="new-opp-payment-terms-control" class="new-opp-link-control"></div>
									</div>
									<div id="new-opp-payment-preview-wrap" class="new-opp-field d-none" style="margin-top:12px;">
										<label>Payment Schedule</label>
										<div class="table-wrap new-opp-table-wrap new-opp-preview-table-wrap">
											<table class="detail-table new-opp-preview-table">
												<thead>
													<tr>
														<th><span class="th-ellipsis" title="No.">No.</span></th>
														<th><span class="th-ellipsis" title="Payment Term">Payment Term</span></th>
														<th><span class="th-ellipsis" title="Description">Description</span></th>
														<th><span class="th-ellipsis" title="Invoice Portion">Invoice Portion (%)</span></th>
														<th><span class="th-ellipsis" title="Due Date">Due Date</span></th>
														<th><span class="th-ellipsis" title="Payment Amount">Payment Amount (INR)</span></th>
													</tr>
												</thead>
												<tbody id="new-opp-payment-preview-body"></tbody>
											</table>
										</div>
										<div class="new-opp-field" style="margin-top:10px;">
											<label>Total Scheduled Amount (INR)</label>
											<div id="new-opp-payment-preview-total" class="form-control" style="height:auto;min-height:38px;display:flex;align-items:center;">${fmtCurrency(0)}</div>
										</div>
									</div>
									<div class="card__title" style="margin:18px 0 12px;">Terms &amp; Conditions</div>
								<div class="new-opp-field">
									<label>Terms Template</label>
									<div id="new-opp-terms-template-control" class="new-opp-link-control"></div>
								</div>
								<div class="new-opp-field">
									<label>Terms and Conditions</label>
									<div id="new-opp-terms-and-conditions" class="form-control ql-editor read-mode" style="min-height:140px;max-height:300px;overflow-y:auto;background:#fff;"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Wizard Footer Navigation -->
          <div class="new-opp-wizard-footer">
            <button class="btn btn-default" id="new-opp-cancel" type="button">Cancel</button>
            <div class="new-opp-wizard-nav">
              <button class="btn btn-default d-none" id="new-opp-back" type="button">&#8592; Back</button>
              <button class="btn btn-primary1" id="new-opp-next" type="button">Next &#8594;</button>
              <button class="btn btn-primary1 d-none" id="new-opp-save" type="button">Create Customer Order Form</button>
            </div>
          </div>

        </div>
      </div>

    </div>
  `
	};

})();
