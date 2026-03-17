/*frappe.pages['new-issue'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}*/

frappe.pages['new-issue'].on_page_load = (wrapper) => {
	//console.log("on_page_load triggered");
	new MyPage(wrapper);
};

// route change handler
frappe.router.on('change', () => {
	const route = frappe.get_route();
	const current_page = route[0];
	//console.log("Route changed:", route.join("/"));
	// leaving new-issue
	if (frappe.my_issue_assets && current_page !== "new-issue") {
		////console.log("Cleaning up new-issue assets...");
		//frappe.my_issue_assets.cleanup();
		location.reload();
	}
	// coming back to new-issue
	if (current_page === "new-issue" && frappe.my_issue_assets) {
		//console.log("Re-initializing new-issue assets...");
		setTimeout(() => {
			frappe.my_issue_assets.reapply();
		}, 500)
	}
});

if (!window.MyPageDefined) {
	window.MyPageDefined = true;

	class MyPage {
		constructor(wrapper) {
			this.wrapper = wrapper;
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: '',
				single_column: true
			});
			// cache structure to remember injected things
			this._cache = {
				css: [],         // href strings
				js: [],          // src strings
				inlineScripts: [], // strings
				rendered_html: null
			};
			this.make();
		}

		make() {
			//console.log("🧭 make() called...");

			if (frappe.new_issue_page && frappe.new_issue_page.body) {
				$(this.page.main).append(frappe.new_issue_page.body);
			}

			this.load_support_page()
				.then(() => {
					//console.log("✅ Support page loaded");

					// Ensure both child doctypes are loaded
					return Promise.all([
						frappe.model.with_doctype("Issue Contact List"),
						frappe.model.with_doctype("Active Renewals")
					]);
				})
				.then(() => {
					//console.log("✅ Doctypes loaded, binding form...");
					this.bind_issue_form_events();
				})
				.catch((err) => {
					console.error("❌ Error initializing form:", err);
				});
		}
		// ---------------------------------------------------------------------

		load_support_page() {
			//console.log("📄 Loading support page...");

			return new Promise((resolve, reject) => {
				frappe.call({
					method: "renewal_module.api.get_support_page",
					callback: (r) => {
						if (r.message && r.message.rendered_html) {
							this.process_and_render_html(r.message.rendered_html);
							resolve();
						} else {
							reject("Support page HTML missing");
						}
					},
					error: (err) => reject(err)
				});
			});
		}



		async process_and_render_html(html) {
			//console.group("Asset Injection & HTML Rendering");
			const temp = document.createElement("div");
			temp.innerHTML = html;

			// --- collect CSS hrefs and inject them (tagged) ---
			temp.querySelectorAll('link[href]').forEach(link => {
				const href = link.getAttribute('href');
				if (!href) return;
				// record in cache if not already
				if (this._cache.css.indexOf(href) === -1) this._cache.css.push(href);

				// only inject if not present
				if (!document.querySelector(`link[href="${href}"][data-new-issue="true"]`) &&
					!document.querySelector(`link[href="${href}"]`)) {
					const css = document.createElement('link');
					css.rel = 'stylesheet';
					css.href = href;
					css.dataset.newIssue = "true";
					document.head.appendChild(css);
					//console.log(`CSS injected: ${href}`);
				} else {
					//console.log(`CSS exists or tagged already: ${href}`);
				}
			});

			// --- collect external JS srcs and prepare load promises ---
			const scriptPromises = [];
			temp.querySelectorAll('script[src]').forEach(script => {
				const src = script.getAttribute('src');
				if (!src) return;
				if (this._cache.js.indexOf(src) === -1) this._cache.js.push(src);

				// only add and load if no script with same src is present
				if (!document.querySelector(`script[src="${src}"][data-new-issue="true"]`) &&
					!document.querySelector(`script[src="${src}"]`)) {
					const promise = new Promise((resolve, reject) => {
						const s = document.createElement('script');
						s.src = src;
						s.defer = true;
						s.dataset.newIssue = "true";
						s.onload = () => {
							//console.log(`Loaded JS: ${src}`);
							resolve(src);
						};
						s.onerror = () => { console.warn(`Failed to load JS: ${src}`); reject(src); };
						document.body.appendChild(s);
					});
					scriptPromises.push(promise);
				} else {
					//console.log(`JS exists or tagged already: ${src}`);
				}
			});

			// --- collect inline script text ---
			this._cache.inlineScripts = this._cache.inlineScripts || [];
			temp.querySelectorAll('script:not([src])').forEach(script => {
				const code = script.textContent && script.textContent.trim();
				if (code) {
					this._cache.inlineScripts.push(code);
					//console.log("Found inline script block (cached).");
				}
				script.remove();
			});

			// --- store rendered html (as fragment) into cache ---
			this._cache.rendered_html = temp.innerHTML;

			temp.querySelectorAll('style').forEach(styleTag => {
				styleTag.dataset.newIssue = "true";
			});


			// --- remove leftover link/script tags from temp (we already handled them) ---
			temp.querySelectorAll('link, script').forEach(tag => tag.remove());

			// --- inject HTML into wrapper BEFORE .content-page ---
			const $wrapper = $(this.page.main).find('.wrapper');
			const $contentPage = $wrapper.find('.content-page').first();

			if ($contentPage.length) {
				$contentPage.before(temp.innerHTML);
				//console.log("Inserted rendered HTML before .content-page");
			} else if ($wrapper.length) {
				$wrapper.prepend(temp.innerHTML);
				//console.log("Prepended rendered HTML to .wrapper (no .content-page)");
			} else {
				$(this.page.main).prepend(temp.innerHTML);
				console.warn(".wrapper not found, HTML inserted in page.main");
			}

			//console.groupEnd();

			// --- wait for externals to load, then run inline code and initialize theme/ui ---
			try {
				await Promise.allSettled(scriptPromises);
				//console.log("External scripts settled — running inline scripts (cached).");

				// run only newly cached inline scripts (execute all cached ensures behavior same on reapply)
				(this._cache.inlineScripts || []).forEach(code => {
					try {
						const fn = new Function(code);
						fn();
						//console.log("Inline script executed successfully");
					} catch (err) {
						console.error("Inline script execution error:", err);
					}
				});

				this.initialize_theme_scripts();

				// reinit bootstrap UI after a short delay
				setTimeout(() => this.reinit_bootstrap_ui(), 300);
			} catch (err) {
				console.warn("Some scripts failed:", err);
				this.initialize_theme_scripts();
				setTimeout(() => this.reinit_bootstrap_ui(), 300);
			}
		}


		initialize_theme_scripts() {
			try {
				//console.group("Theme Init");
				if (typeof App !== 'undefined') new App().init();
				if (typeof LayoutCustomizer !== 'undefined') new LayoutCustomizer().init();
				if (typeof Plugins !== 'undefined') new Plugins().init();
				if (typeof I18nManager !== 'undefined') new I18nManager().init();
				//console.groupEnd();
				//console.log("Theme scripts initialized");

				// register asset manager (pass instance so reapply can use cache)
				frappe.my_issue_assets = this.createAssetManager(this);
			} catch (err) {
				console.error("Theme initialization failed:", err);
			}
		}

		reinit_bootstrap_ui() {
			try {
				//console.group("Reinitializing Bootstrap UI components");
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
				//console.groupEnd();
			} catch (err) {
				console.error("Failed to reinitialize Bootstrap UI:", err);
			}
		}

		//asset manager uses instance cache and wrapper to cleanup/reapply everything
		createAssetManager(instance) {
			const pageWrapperSelector = () => {
				// try to find same wrapper inside current page DOM
				const pageMain = instance.page && instance.page.main ? instance.page.main : document;
				return $(pageMain).find('.wrapper').get(0);
			};

			return {
				cleanup() {
					//console.group("🧹 Cleaning up new-issue assets");
					let removed_css = 0, removed_js = 0, removed_style = 0;

					if (!frappe.new_issue_page) frappe.new_issue_page = {};
					frappe.new_issue_page._inline_styles_backup = [];

					// Use instance._cache instead of undefined global variable
					const cache = instance._cache || { css: [], js: [] };

					// --- 1. Remove CSS files we injected or matching new_issue.css ---
					cache.css.forEach(href => {
						const el = document.querySelector(`link[href="${href}"]`);
						if (el) {
							el.remove();
							removed_css++;
							//console.log(" Removed CSS:", href);
						}
					});
					// fallback: if any leftover new_issue.css without tag
					document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
						const href = link.getAttribute('href') || "";
						if (href.includes("new_issue.css")) {
							link.remove();
							removed_css++;
							//console.log("Removed leftover new_issue.css");
						}
					});

					// --- 2. Remove JS files we injected ---
					cache.js.forEach(src => {
						const el = document.querySelector(`script[src="${src}"]`);
						if (el) {
							el.remove();
							removed_js++;
							//console.log("Removed JS:", src);
						}
					});

					// --- 3. Remove inline <style> tags added dynamically ---
					document.querySelectorAll('style').forEach(el => {
						const text = el.textContent.trim();
						if (text.includes('.new-issue') || text.includes('#new-issue') || el.dataset.newIssue === "true") {
							frappe.new_issue_page._inline_styles_backup.push(text);
							el.remove();
							removed_style++;
							//console.log('Removed inline <style> tag.');
							//console.log('Removing inline <style>:', text.substring(0, 2500) + '...');
						}
					});

					// --- 4. Remove injected HTML inside wrapper except .content-page ---
					const wrapperEl = (() => {
						const pageMain = instance.page && instance.page.main ? instance.page.main : document;
						return $(pageMain).find('.wrapper').get(0);
					})();
					if (wrapperEl) {
						Array.from(wrapperEl.children).forEach(child => {
							if (!child.classList.contains('content-page')) child.remove();
						});
						//console.log("Removed injected HTML from .wrapper");
					}

					//console.log(`Cleanup completed — removed ${removed_css} CSS, ${removed_js} JS, ${removed_style} inline styles.`);
					//console.groupEnd();
				},


				cleanup() {
					//console.group("🧹 Cleaning up new-issue assets (safe cleanup)");
					let removed_css = 0, removed_js = 0, removed_style = 0;

					if (!frappe.new_issue_page) frappe.new_issue_page = {};
					frappe.new_issue_page._inline_styles_backup = [];

					const cache = instance._cache || { css: [], js: [] };
					const globalJsWhitelist = [
						'jquery', 'popper', 'bootstrap', 'frappe', 'desk.min.js'
					];

					// --- 1. Remove CSS files we injected ---
					cache.css.forEach(href => {
						const el = document.querySelector(`link[href="${href}"][data-new-issue="true"]`);
						if (el) {
							el.remove();
							removed_css++;
							//console.log("Removed tagged CSS:", href);
						}
					});

					// fallback for untagged new_issue.css
					document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
						const href = link.getAttribute('href') || "";
						if (href.includes("new_issue.css")) {
							link.remove();
							removed_css++;
							//console.log("Removed leftover new_issue.css:", href);
						}
					});

					// --- 2. Remove only safe-to-remove JS files (skip core libs) ---
					cache.js.forEach(src => {
						const lowerSrc = src.toLowerCase();
						if (globalJsWhitelist.some(lib => lowerSrc.includes(lib))) {
							//console.log("Skipping global JS removal:", src);
							return;
						}
						const el = document.querySelector(`script[src="${src}"][data-new-issue="true"]`);
						if (el) {
							el.remove();
							removed_js++;
							//console.log("Removed tagged JS:", src);
						}
					});

					// fallback for leftover "new_issue" scripts
					document.querySelectorAll('script[src]').forEach(script => {
						const src = script.getAttribute('src') || "";
						if (src.includes("new_issue") && !globalJsWhitelist.some(lib => src.includes(lib))) {
							script.remove();
							removed_js++;
							//console.log("Removed leftover new_issue script:", src);
						}
					});

					// --- 3. Remove inline <style> tags added dynamically ---
					document.querySelectorAll('style').forEach(el => {
						const text = (el.textContent || "").trim();
						if (
							el.dataset.newIssue === "true" ||
							text.includes('.new-issue') ||
							text.includes('#new-issue')
						) {
							frappe.new_issue_page._inline_styles_backup.push(text);
							el.remove();
							removed_style++;
							//console.log("Removed inline style (tagged or matched)");
						}
					});

					// --- 4. Remove injected HTML inside wrapper except .content-page ---
					const wrapperEl = (() => {
						const pageMain = instance.page && instance.page.main ? instance.page.main : document;
						return $(pageMain).find('.wrapper').get(0);
					})();
					if (wrapperEl) {
						Array.from(wrapperEl.children).forEach(child => {
							if (!child.classList.contains('content-page')) child.remove();
						});
						//console.log("Removed injected HTML from .wrapper");
					}

					//console.log(`Cleanup completed — removed ${removed_css} CSS, ${removed_js} JS, ${removed_style} inline styles.`);
					//console.groupEnd();
				},



				reapply() {
					//console.group("Reapplying new-issue assets");
					// re-inject CSS files from cache (avoid duplicates)
					(instance._cache.css || []).forEach(href => {
						if (!document.querySelector(`link[href="${href}"]`)) {
							const css = document.createElement('link');
							css.rel = 'stylesheet';
							css.href = href;
							css.dataset.newIssue = "true";
							document.head.appendChild(css);
							//console.log("Re-injected CSS:", href);
						}
					});

					// re-inject JS files from cache (add new script tags)
					const jsPromises = (instance._cache.js || []).map(src => {
						return new Promise((resolve) => {
							// if script already exists, skip
							if (document.querySelector(`script[src="${src}"]`)) {
								//console.log("JS already present, skipping re-inject:", src);
								return resolve();
							}
							const s = document.createElement('script');
							s.src = src;
							s.defer = true;
							s.dataset.newIssue = "true";
							s.onload = () => {
								//console.log("Re-loaded JS:", src);
								resolve();
							};
							s.onerror = () => { console.warn("Failed to reload JS:", src); resolve(); };
							document.body.appendChild(s);
						});
					});

					// after scripts reloaded, reinsert HTML + run inline scripts + init
					Promise.allSettled(jsPromises).then(() => {
						// reinsert rendered html BEFORE .content-page
						const wrapperEl = pageWrapperSelector();
						if (wrapperEl) {
							// make sure no duplicate: remove injected children (except .content-page) then insert
							Array.from(wrapperEl.children).forEach(child => {
								if (!child.classList.contains('content-page')) child.remove();
							});

							// insert cached HTML
							if (instance._cache.rendered_html) {
								// insert as DOM nodes
								const frag = document.createRange().createContextualFragment(instance._cache.rendered_html);
								// place before .content-page if exists
								const contentEl = wrapperEl.querySelector('.content-page');
								if (contentEl) wrapperEl.insertBefore(frag, contentEl);
								else wrapperEl.prepend(frag);
								//console.log("Reinserted cached rendered HTML into .wrapper");
							}
						}

						// run cached inline scripts
						(instance._cache.inlineScripts || []).forEach(code => {
							try {
								const fn = new Function(code);
								fn();
								//console.log("Re-executed inline script");
							} catch (err) {
								console.error("Inline script re-exec error:", err);
							}
						});

						// reinitialize theme and UI
						try {
							instance.initialize_theme_scripts();
						} catch (err) {
							console.error("Error during re-initialize theme scripts:", err);
						}
						// and reinit bootstrap UI
						setTimeout(() => instance.reinit_bootstrap_ui(), 500);

						//console.groupEnd();
					});
				}
			};
		}

		bind_issue_form_events() {
			//console.log("Binding New Issue form events...");
			const me = this;
			const form = document.getElementById("new-issue-form");
			if (!form) return;

			const statusBox = document.createElement("div");
			form.appendChild(statusBox);
			// 🔹 Hide fields initially
			const activesubscriptionwrapper = document.getElementById("activesubscription-field");
			const querytypewrapper = document.getElementById("querytype-field");
			activesubscriptionwrapper.style.display = "none";
			querytypewrapper.style.display = "none";

			// Basic field controls
			let subjectControl = frappe.ui.form.make_control({
				parent: document.getElementById("subject-field"),
				df: { fieldtype: "Data", reqd: 1, label: "Subject" },
				render_input: true
			});

			let selectedSalesperson = "";
			// when customer changes, filter contact list users
			let customerControl = frappe.ui.form.make_control({
				parent: document.getElementById("customer-field"),
				df: {
					fieldtype: "Link",
					options: "Customer",
					reqd: 1,
					label: "Customer",
					onchange: function () {
						const cust = customerControl.get_value();
						//console.log("Customer onchange triggered. Selected Customer:", cust);
						toggleSubscriptionAndQueryType();
						if (cust && cust.trim() !== "") {
							//console.log("Customer selected. Applying filters and fetching account manager...");
							// 🧩 Fetch active subscriptions (Renewal List items) for this customer
							frappe.call({
								method: "frappe.client.get_list",
								args: {
									doctype: "Renewal List",
									fields: ["name", "product_name"],
									filters: {
										customer_name: cust,
										status: ["in", ["Active", "Cofed"]]
									},
									limit_page_length: 100
								},
								callback: function (r) {
									//console.log("Fetched Renewal List:", r.message);
									if (r && r.message) {
										// Map product names to options
										let options = [""].concat(r.message.map(item => item.product_name));
										// let uniqueProducts = [...new Set(r.message.map(item => item.product_name))];
										// let options = [""].concat(uniqueProducts);
										activesubscriptionControl.df.options = options.join("\n");
										activesubscriptionControl.refresh();
									} else {
										activesubscriptionControl.df.options = [""];
										activesubscriptionControl.refresh();
									}
								}
							});
							frappe.db.get_value("Customer", cust, "account_manager", (r) => {
								if (r && r.account_manager) {
									selectedSalesperson = r.account_manager;
									//console.log("salesperson:", selectedSalesperson);
								} else {
									selectedSalesperson = "";
									//console.log("No account manager found for this customer.");
								}
							});

						} else {
							//console.log("No customer selected. Resetting salesperson and clearing filters.");
							selectedSalesperson = "";
						}
					}

				},
				render_input: true
			});

			let departmentControl = frappe.ui.form.make_control({
				parent: document.getElementById("department-field"),
				df: {
					fieldtype: "Select",
					options: ["", "Technical", "Accounts Team & Billing", "Sales", "Demo", "Other"],
					reqd: 1,
					label: "Department",
					onchange: function () {
						toggleSubscriptionAndQueryType();
					}
				},
				render_input: true
			});

			function toggleSubscriptionAndQueryType() {
				const cust = customerControl.get_value();
				const dept = departmentControl.get_value();

				if (cust && dept === "Technical") {
					// Show fields
					activesubscriptionwrapper.style.display = "block";
					querytypewrapper.style.display = "block";
				} else {
					// Hide fields
					activesubscriptionwrapper.style.display = "none";
					querytypewrapper.style.display = "none";
				}
			}

			let activesubscriptionControl = frappe.ui.form.make_control({
				parent: document.getElementById("activesubscription-field"),
				df: { fieldtype: "Select", options: "", label: "Active Subscription" },
				render_input: true
			});


			let descriptionControl = frappe.ui.form.make_control({
				parent: document.getElementById("description-field"),
				df: { fieldtype: "Text Editor", label: "Description" },
				render_input: true
			});

			let querytypeControl = frappe.ui.form.make_control({
				parent: document.getElementById("querytype-field"),
				df: { fieldtype: "Select", options: [""], label: "Query Type" },
				render_input: true
			});

			querytypeControl.$input.on("change", function () {
				const selectedQueryType = querytypeControl.get_value();
				//console.log("Query Type selected:", selectedQueryType);

				if (taskMetaMap[selectedQueryType]) {
					const meta = taskMetaMap[selectedQueryType];
					selectedPriority = meta.priority || "";
					selectedSupportType = meta.support_type || "";
					//console.log(`Auto-filled priority: ${selectedPriority}, support type: ${selectedSupportType}`);
				} else {
					selectedPriority = "";
					selectedSupportType = "";
				}
			});

			let selectedPriority = "";
			let selectedSupportType = "";
			let taskMetaMap = {}; // Store task metadata for each query type

			function setupContactPersonSection(me) {
				const contactContainer = $("#contact-list-container");
				const addButton = $("#add-contact-person");

				let contactList = [];

				//Render Contact List
				function renderContactList() {
					if (!contactList.length) {
						contactContainer.html(`<span class="text-muted">No contacts added.</span>`);
						return;
					}

					let html = "";
					contactList.forEach((row, i) => {
						const name = (row.user_name || "").split("-")[0].trim();
						html += `
							<div class="d-flex  align-items-center mb-1">
								<span class="contact-name text-primary me-1 ellipsis" style="cursor:pointer;">${name}</span>
								<i class="ti ti-trash text-danger delete-contact" 
									data-index="${i}" 
									style="cursor:pointer;" 
									title="Remove Contact"></i>
							</div>
						`;
					});
					contactContainer.html(html);
				}

				// Add Contact Popup
				addButton.off("click").on("click", function () {
					const selected_customer = customerControl?.get_value?.();

					if (!selected_customer) {
						frappe.msgprint("Please select a Customer first.");
						return;
					}

					const dialog = new frappe.ui.Dialog({
						title: __("Add Contact Person"),
						fields: [
							{
								label: "Contact",
								fieldname: "user_name",
								fieldtype: "Link",
								options: "Contact",
								reqd: 1,
								get_query: () => ({
									filters: { company_name: selected_customer }
								})
							},
							{
								label: "Mobile No",
								fieldname: "mobile_no",
								fieldtype: "Data",
								read_only: 1,
								hidden: 1
							},
							{
								label: "Email ID",
								fieldname: "email_id",
								fieldtype: "Data",
								read_only: 1,
								hidden: 1
							},
							{
								label: "Designation",
								fieldname: "designation",
								fieldtype: "Data",
								read_only: 1,
								hidden: 1
							}
						],
						primary_action_label: __("Add"),
						primary_action(values) {
							if (!values.user_name) return;

							// prevent duplicates
							if (contactList.some(c => c.user_name === values.user_name)) {
								frappe.show_alert({
									message: __("Contact already added."),
									indicator: "orange"
								});
								dialog.hide();
								return;
							}

							contactList.push({
								user_name: values.user_name,
								mobile_no: values.mobile_no || "",
								email_id: values.email_id || "",
								designation: values.designation || ""
							});

							renderContactList();
							dialog.hide();
						}
					});

					// Auto-fill on contact select
					dialog.fields_dict.user_name.df.onchange = async function () {
						const contact = dialog.get_value("user_name");
						if (!contact) return;

						const res = await frappe.db.get_doc("Contact", contact);
						if (res) {
							dialog.set_value("mobile_no", res.phone || "");
							dialog.set_value("email_id", res.email_id || "");
							dialog.set_value("designation", res.designation || "");
						}
					};

					dialog.show();
					setTimeout(() => {
						const closeBtn = dialog.get_close_btn();
						if (!closeBtn || !closeBtn.length) {
							return;
						}
						closeBtn.off("click.dialog").on("click.dialog", function () {
							dialog.hide();
						});
					}, 50);
				});

				// 🔹 Remove Contact
				$(document).off("click", ".delete-contact").on("click", ".delete-contact", function () {
					const index = $(this).data("index");
					contactList.splice(index, 1);
					renderContactList();
				});

				me.getContactList = () => contactList;
				me.resetContactList = function () {
					contactList = [];
					renderContactList();
				};

			}

			// Initialize contact section
			frappe.after_ajax(() => {
				setupContactPersonSection(me);
			});

			let activeRenewalsData = [];
			// When Active Subscription changes → fetch renewal list data + dynamic query type options
			activesubscriptionControl.$input.on("change", function () {
				const selected_item = activesubscriptionControl.get_value();
				const selected_customer = customerControl.get_value();
				//console.log("Active Subscription changed:", selected_item, "for customer:", selected_customer);
				if (!selected_item || !selected_customer) {
					console.warn("Customer or subscription not selected, skipping data load.");
					activeRenewalsData = []; // clear stored data
					// reset query type to default
					querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
					querytypeControl.refresh();
					return;
				}

				// Fetch Renewal List entry for this customer + product
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Renewal List",
						fields: ["name", "product_name", "start_date", "end_date", "total_quantity", "total_amount", "sla_product"],
						filters: {
							customer_name: selected_customer,
							product_name: selected_item,
							status: ["in", ["Active", "Cofed"]]
						},
						limit_page_length: 1
					},
					callback: function (r) {
						if (r && r.message && r.message.length > 0) {
							const renewal = r.message[0];
							//console.log("✅ Renewal List entry:", renewal);

							// Store active renewal data
							activeRenewalsData = [{
								item: renewal.product_name,
								start_date: renewal.start_date,
								end_date: renewal.end_date,
								quantity: renewal.total_quantity,
								amount: renewal.total_amount,
								renewal_id: renewal.name
							}];

							// 🔹 If Renewal List has an SLA Product, fetch its related Item (custom_tasks)
							if (renewal.sla_product) {
								frappe.call({
									method: "frappe.client.get",
									args: {
										doctype: "Item",
										name: renewal.sla_product
									},
									callback: function (res) {
										if (!res.message) {
											console.warn("⚠️ No Item found for SLA Product:", renewal.sla_product);
											return;
										}

										const itemDoc = res.message;
										const taskData = itemDoc.custom_sla_tasks || [];
										//console.log("custom_sla_tasks:", taskData);

										let tasks = [];
										taskMetaMap = {}; // reset map

										if (Array.isArray(taskData)) {
											taskData.forEach(t => {
												if (t.task && !tasks.includes(t.task)) {
													tasks.push(t.task);
													taskMetaMap[t.task] = {
														priority: t.priority || "",
														support_type: t.custom_support_type || ""
													};
												}
											});
										}

										if (tasks.length > 0) {
											//console.log("✅ Dynamic Query Type options:", tasks);
											querytypeControl.df.options = ["", ...tasks].join("\n");
											querytypeControl.refresh();
										} else {
											//console.log("⚠️ No tasks found, using defaults");
											querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
											querytypeControl.refresh();
										}
									}
								});
							} else {
								//console.log("⚠️ No SLA Product linked. Using standard query types.");
								querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
								querytypeControl.refresh();
							}
						} else {
							//console.log("No active renewals found for this selection.");
							activeRenewalsData = [];
							querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
							querytypeControl.refresh();
						}
					}
				});
			});

			// Handle form submission
			form.addEventListener("submit", function (e) {
				e.preventDefault();
				const subject = subjectControl.get_value();
				const customer = customerControl.get_value();
				const department = departmentControl.get_value();
				const custom_query_type = querytypeControl.get_value();
				const description = descriptionControl.get_value();
				const activesubscription = activesubscriptionControl.get_value();
				const contact_list = me.getContactList?.() || [];
				const priority = selectedPriority || "Medium";
				const support_type = selectedSupportType || "Remote Type";


				if (!subject || !customer || !department) {
					statusBox.innerHTML = `<div class="alert alert-warning mt-2">Please fill required fields.</div>`;
					return;
				}

				statusBox.innerHTML = `<div class="alert alert-info mt-2">Creating issue...</div>`;

				// Prepare Issue doc for insertion
				const new_issue_doc = {
					doctype: "Issue",
					subject,
					customer,
					department,
					description,
					custom_query_type,
					sales_person: selectedSalesperson || "",
					raised_by: frappe.session?.user || "",
					active_subscription: activesubscription,
					priority,
					support_type,
					// ✅ Include child tables
					issue_contact_list: contact_list.map(row => {
						return {
							user_name: row.user_name,
							email_id: row.email_id || "",
							mobile_no: row.mobile_no || "",
							designation: row.designation || ""
						};
					}),
					active_renewals: activeRenewalsData.map(row => ({
						item: row.item,
						start_date: row.start_date,
						end_date: row.end_date,
						quantity: row.quantity,
						amount: row.amount,
						renewal_id: row.renewal_id
					}))
				};

				//console.log("📦 Submitting Issue doc:", new_issue_doc);

				// Insert Issue via frappe.client.insert
				frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: new_issue_doc
					},
					callback: (r) => {
						if (r.message) {
							const issue_name = r.message.name;

							// statusBox.innerHTML = `
							// <div class="alert alert-success mt-2">
							// 	Issue <b>${issue_name}</b> created successfully.
							// </div>`;

							//console.log("✅ Issue created:", r.message);

							// ✅ Show success popup
							frappe.show_alert({
								message: __("Issue {0} created successfully.", [issue_name]),
								indicator: "green"
							}, 5);

							// ✅ Redirect to Issue Theme Details page after 1 second
							setTimeout(() => {
								window.location.href = `/app/issue-theme-details/${issue_name}`;
							}, 1000);

							// Reset form fields (optional if you redirect anyway)
							form.reset();
							subjectControl.set_value("");
							customerControl.set_value("");
							departmentControl.set_value("");
							querytypeControl.set_value("");
							descriptionControl.set_value("");
							selectedSalesperson = "";
							activesubscriptionControl.set_value("");
							activesubscriptionControl.df.options = "";
							if (me.resetContactList) me.resetContactList();
							activeRenewalsData = [];

							document.getElementById("activerenewals-field").style.display = "none";
							document.getElementById("activesubscription-field").style.display = "none";
							document.getElementById("salesperson-field").style.display = "none";

						} else {
							statusBox.innerHTML = `<div class="alert alert-danger mt-2">Failed to create issue.</div>`;
						}
					},
					error: (err) => {
						frappe.msgprint({
							title: __("Error"),
							message: __(err?.message || err || "An unexpected error occurred."),
							indicator: "red"
						});
						console.error("Issue creation failed:", err);
					}

				});
			});
		}

	}

	window.MyPage = MyPage;
}

frappe.new_issue_page = {
	body: `
		<div class="wrapper">
			<!-- rendered HTML will be inserted above this .content-page -->
			<div class="content-page">
				<div class="container-fluid" style="background-color: #F3F4F6;">
					<div class="row p-2">
						<div class="card">
							<div class="card-body" style="padding:5px;">
								<h4 class="mb-1">New Issue</h4>
								<form id="new-issue-form">
									<div class="row">
										<div class="col-12">
											<div class="mb-3">
												<div id="subject-field"></div>
											</div>
										</div>
									</div>

									<div class="row">
										<div class="col-6">
											<div class="mb-3">
												<div id="customer-field"></div>
											</div>
										</div>
										<div class="col-6">
											<div class="mb-3">
												<div id="department-field"></div>
											</div>
										</div>
									</div>

									<div class="row">
										<div class="col-6">
											<div class="mb-3">
												<div id="activesubscription-field"></div>
											</div>
										</div>
										<div class="col-6">
											<div class="mb-3">
												<div id="querytype-field"></div>
											</div>
										</div>
									</div>

									<div class="row">
										<div class="col-6">
											<div class="mb-3">
												<label class="control-label">
													Contact Person
													<i id="add-contact-person" class="fa fa-plus text-primary ms-1" style="cursor:pointer;" title="Add Contact"></i>
												</label>
												<div id="contact-list-container" class="ps-2"></div>
											</div>

										</div>
									</div>


									<div class="row">
										<div class="col-12">
											<div class="mb-3">
												<div id="description-field"></div>
											</div>
										</div>
									</div>
									
									<div class="row">
										<div class="col-12 text-end">
											<button type="submit" class="btn btn-primary">Save Issue</button>
										</div>
									</div>
								</form>	
							</div>
						</div>
					</div>	
				</div>

				<footer class="footer">
					<div class="container-fluid">
						<div class="row">
							<div class="col-12 text-center">
								© <span class="fw-semibold">64 Network Security Pvt Ltd</span>
							</div>
						</div>
					</div>
				</footer>
			</div>
		</div>
	`
};
