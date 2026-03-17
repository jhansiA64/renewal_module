// frappe.pages['issue-theme-details'].on_page_load = (wrapper) => {
// 	console.log("on_page_load triggered");
// 	try {
// 		new window.issueThemeDetailsPage(wrapper);
// 	} catch (err) {
// 		console.error("Failed to instantiate issueThemeDetailsPage:", err);
// 	}
// };


frappe.pages['issue-theme-details'].on_page_load = (wrapper) => {
	// 	console.log("on_page_load triggered");
	new issueThemeDetailsPage(wrapper);
};

frappe.router.on('change', () => {
	const route = frappe.get_route();
	if (frappe.issue_theme_details_page && route[0] !== "issue-theme-details") {
		location.reload(); // Reload the page
	} else if (frappe.issue_theme_details_page && route[0] === "issue-theme-details") {
		// Safely attempt to re-initialize assets or fall back to reload
		try {
			if (frappe.issue_theme_details_page && typeof frappe.issue_theme_details_page.load_assets === "function") {
				frappe.issue_theme_details_page.load_assets(() => {
					if (typeof frappe.issue_theme_details_page.make === "function") {
						frappe.issue_theme_details_page.make();
					}
				});
			} else {
				// Fallback to ensure a consistent state
				location.reload();
			}
			setTimeout(() => {
				if (typeof frappe.issue_theme_details_page.initDropdowns === "function") {
					frappe.issue_theme_details_page.initDropdowns();
				}
			}, 800);
		} catch (err) {
			console.error("Failed to re-initialize issue theme page on route change:", err);
			location.reload();
		}
	}
});

// --------- MyPage class (replace your existing MyPage class) ----------
if (!window.MyissuethemedetailsPageDefined) {
	window.MyissuethemedetailsPageDefined = true;
	class issueThemeDetailsPage {
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
			//frappe.issue_theme_details_page = this.createAssetManager(this);
			frappe.issue_theme_details_page = this.createAssetManager(this, "issue-theme-details");
		}

		make() {
			if (frappe.issue_theme_details_page && frappe.issue_theme_details_page.body) {
				$(this.page.main).append(frappe.issue_theme_details_page.body);
			}
			this.initialize_theme_scripts();
			this.load_support_page();
			// Inside MyPage.make() or after HTML is injected
			$(this.page.main).attr("data-route", "issue-theme-details");

			const issueName = frappe.get_route()[1]; // e.g. "ISS250133"

			if (issueName) {
				this.load_issue_details?.(issueName, this.page);
			}
			this.show_work_timer(issueName);
			this.bindEvent(issueName);
			this.bindTagEvents(issueName, $(".leftcol"), $(".rightcol"));
			this.setup_breadcrumb_filter_link();

			let originalDesc = "";
			//CLICK DESCRIPTION → ENTER EDIT MODE
			$(document).off("click", "#description").on("click", "#description", function () {
				const desc = $(this);
				if (desc.attr("contenteditable") === "true") return; // already editing
				originalDesc = desc.html().trim();

				desc.attr("contenteditable", "true").focus();
				$("#saveDescBtn").removeClass("d-none"); // show save button
			});

			//CLICK SAVE BUTTON → SAVE CHANGES
			$(document).off("click", "#saveDescBtn").on("click", "#saveDescBtn", function () {
				const desc = $("#description");
				const newDesc = desc.html().trim();

				// No changes — exit edit mode
				if (newDesc === originalDesc) {
					desc.removeAttr("contenteditable");
					$(this).addClass("d-none"); // hide save button
					return;
				}

				// Save to backend
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Issue",
						name: frappe.get_route()[1],
						fieldname: { description: newDesc }
					},
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Description updated successfully."),
								indicator: "green"
							});
						} else {
							frappe.show_alert({
								message: __("Failed to update description."),
								indicator: "red"
							});
						}

						desc.removeAttr("contenteditable");
						$("#saveDescBtn").addClass("d-none"); // hide save btn
					}
				});
			});

			// CLICK OUTSIDE → EXIT EDIT MODE (FIXES YOUR ISSUE)
			$(document).on("click", function (e) {
				const desc = $("#description");
				const saveBtn = $("#saveDescBtn");

				if (desc.attr("contenteditable") !== "true") return;

				if ($(e.target).closest("#description").length || $(e.target).closest("#saveDescBtn").length) {
					return;
				}

				desc.removeAttr("contenteditable");
				saveBtn.addClass("d-none");
			});



			$(document).off("click", "#add-contact-btn").on("click", "#add-contact-btn", function () {
				const issueName = frappe.get_route()[1];
				if (!issueName) {
					frappe.msgprint("No issue found.");
					return;
				}

				// Fetch customer for contact filtering
				frappe.db.get_value("Issue", issueName, "customer", (r) => {
					const customer = r?.customer || "";

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
									filters: { company_name: customer }
								})
							},
							{
								label: "Mobile No",
								fieldname: "mobile_no",
								fieldtype: "Data",
								read_only: 1
							},
							{
								label: "Email ID",
								fieldname: "email_id",
								fieldtype: "Data",
								read_only: 1
							},
							{
								label: "Designation",
								fieldname: "designation",
								fieldtype: "Data",
								read_only: 1
							}
						],
						primary_action_label: __("Add"),
						primary_action(values) {
							if (!values.user_name) return;

							frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "Issue Contact List",
										parent: issueName,
										parentfield: "issue_contact_list",
										parenttype: "Issue",
										user_name: values.user_name,
										email_id: values.email_id,
										mobile_no: values.mobile_no,
										designation: values.designation
									}
								},
								callback: function (r) {
									if (!r.exc) {
										frappe.show_alert({
											message: __("✅ Contact added successfully."),
											indicator: "green"
										});
										dialog.hide();
										//window.preventRightPanelAutoHide = false;
										//load_issue_contacts(issueName); // refresh contact list UI
										load_issue_contacts(issueName, values.user_name);
									}
								}
							});
						}
					});

					// 🔹 Hide Mobile, Email, Designation fields properly
					dialog.fields_dict.mobile_no.df.hidden = 1;
					dialog.fields_dict.email_id.df.hidden = 1;
					dialog.fields_dict.designation.df.hidden = 1;
					dialog.refresh();

					// When contact selected → fetch full info
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
			});

			async function load_issue_contacts(issueName, autoOpenUser = null) {
				//console.log("render contact", issueName)
				const res = await frappe.db.get_doc("Issue", issueName);
				const issue = res || {};

				const contactContainer = $("#contact-list-details span.ellipsis");

				if (issue.issue_contact_list?.length) {
					let html = "";
					issue.issue_contact_list.forEach((row, i) => {
						const name = (row.user_name || "").split("-")[0].trim();
						if (name) {
							html += `
								<div class="d-flex align-items-center contact-item" style="margin-bottom: 4px;">
									<span class="contact-name me-1" data-index="${i}" style="cursor:pointer;">
										${name}
									</span>
									<i class="ti ti-trash text-danger delete-contact" 
									style="cursor:pointer; font-size: 14px;" 
									title="Remove Contact"
									data-rowname="${row.name}"></i>
								</div>
							`;
						}
					});

					contactContainer.html(html);
					if (autoOpenUser) {
						const autoIndex = issue.issue_contact_list.findIndex(
							r => r.user_name === autoOpenUser
						);
						if (autoIndex !== -1) {
							$(".contact-name[data-index='" + autoIndex + "']").trigger("click");
						}
					}

				} else {
					contactContainer.html("<span class='text-muted'>No contacts added.</span>");
				}
			}


			function waitForConfirmModal(callback) {
				let tries = 0;
				const maxTries = 20;

				const check = () => {
					const $modal = $(".modal:visible");
					if ($modal.length) {
						callback($modal);
					} else if (tries < maxTries) {
						tries++;
						setTimeout(check, 20);
					}
				};

				check();
			}

			// 🔹 Remove contact from child table
			$(document).off("click", ".delete-contact").on("click", ".delete-contact", function () {
				const issueName = frappe.get_route()[1];
				const rowname = $(this).data("rowname");

				frappe.confirm(
					__("Are you sure you want to remove this contact?"),
					() => {
						frappe.call({
							method: "frappe.client.delete",
							args: { doctype: "Issue Contact List", name: rowname },
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("🗑️ Contact removed successfully."),
										indicator: "green"
									});
									load_issue_contacts(issueName); // refresh list
								}
							}
						});
					}
				);
				waitForConfirmModal(($modal) => {
					const $close = $modal.find(".btn-modal-close");
					$close.off("click.note-confirm").on("click.note-confirm", function (ev) {
						ev.preventDefault();
						ev.stopPropagation();
						try {
							$modal.modal("hide");
						} catch (err) {
							$modal.removeClass("show in").hide();
						}
						$(".modal-backdrop").remove();
					});
				});
			});

		}

		handleRoute() {
			const route = frappe.get_route();
			//console.log("handleRoute:", route);
			if (route[0] == "issue-theme-details") {
				this.location.reload();
			}
		}

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


		// main injection function
		async process_and_render_html(html) {
			//console.group("Asset Injection & HTML Rendering");
			const temp = document.createElement("div");
			temp.innerHTML = html;

			// --- CSS injection ---
			temp.querySelectorAll('link[href]').forEach(link => {
				const href = link.getAttribute('href');
				if (!href) return;
				if (!this._cache.css.includes(href)) this._cache.css.push(href);

				if (!document.querySelector(`link[href="${href}"][data-issue-theme-details="true"]`)) {
					const css = document.createElement('link');
					css.rel = 'stylesheet';
					css.href = href;
					css.dataset.issueThemeDetails = "true";
					document.head.appendChild(css);
					//console.log(`CSS injected: ${href}`);
				}
			});

			// --- JS injection ---
			const scriptPromises = [];
			temp.querySelectorAll('script[src]').forEach(script => {
				const src = script.getAttribute('src');
				if (!src) return;
				if (src.toLowerCase().includes("popper")) {
					//console.warn("Skipping Popper injection to avoid duplicate loading:", src);
					return;
				}
				if (!this._cache.js.includes(src)) this._cache.js.push(src);

				if (!document.querySelector(`script[src="${src}"][data-issue-theme-details="true"]`)) {
					const promise = new Promise((resolve, reject) => {
						const s = document.createElement('script');
						s.src = src;
						s.defer = true;
						s.dataset.issueThemeDetails = "true";
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
			this._cache.inlineScripts = this._cache.inlineScripts || [];
			temp.querySelectorAll('script:not([src])').forEach(script => {
				const code = script.textContent?.trim();
				if (code) this._cache.inlineScripts.push(code);
				script.remove();
			});

			this._cache.rendered_html = temp.innerHTML;
			temp.querySelectorAll('style').forEach(styleTag => {
				styleTag.dataset.issueThemeDetails = "true";
			});

			temp.querySelectorAll('link, script').forEach(tag => tag.remove());

			const $wrapper = $(this.page.main).find('.wrapper');
			const $contentPage = $wrapper.find('.content-page').first();

			// if ($contentPage.length) $contentPage.before(temp.innerHTML);
			// else $wrapper.prepend(temp.innerHTML);
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

			try {
				await Promise.allSettled(scriptPromises);
				//console.log("Scripts loaded, executing inline code...");
				this._cache.inlineScripts.forEach(code => {
					try { new Function(code)(); } catch (err) { console.error("Inline script error:", err); }
				});
				//this.initialize_theme_scripts();
				//setTimeout(() => this.reinit_bootstrap_ui(), 500);
				setTimeout(() => {
					this.initialize_theme_scripts();
					this.reinit_bootstrap_ui();
				}, 800);

			} catch (err) {
				console.error("Script load error:", err);
				this.initialize_theme_scripts();
				setTimeout(() => this.reinit_bootstrap_ui(), 300);
			}

		}

		setup_breadcrumb_filter_link() {
			//console.log("[DEBUG] setup_breadcrumb_filter_link: simplified version active");

			// Helper: read filters from localStorage
			const readSavedFilters = () => {
				const raw = localStorage.getItem("issue_theme_last_filters") || "";
				//console.log("[DEBUG] readSavedFilters raw:", raw);
				if (!raw) return "";
				return raw.startsWith("?") ? raw : "?" + raw;
			};

			// Watch route changes (Frappe router)
			frappe.router.on("change", () => {
				const route = frappe.get_route();
				//console.log("[DEBUG] router.on('change') saw route:", route);
				// Detect our custom page route: /app/issue-theme
				const isIssueThemePage = Array.isArray(route) && route[0] === "issue-theme";
				if (!isIssueThemePage) return;
				//console.log("[DEBUG] Navigated to Issue Theme page — restoring saved filters...");
				const savedQuery = readSavedFilters();
				if (!savedQuery) {
					//console.log("[DEBUG] No saved filters found, skipping.");
					return;
				}
				const newUrl = `/app/issue-theme${savedQuery}`;
				try {
					history.replaceState({}, "", newUrl);
					//console.log("[DEBUG] URL updated with saved filters:", newUrl);
				} catch (err) {
					console.warn("[DEBUG] Failed to update URL:", err);
				}

				// Optional small delay before your list JS runs
				setTimeout(() => {
					if (window.issueThemePage && typeof window.issueThemePage.applyUrlFilters === "function") {
						//console.log("[DEBUG] Applying saved filters using applyUrlFilters()");
						window.issueThemePage.applyUrlFilters();
					}
				}, 300);
			});
		}

		initialize_theme_scripts() {
			try {
				if (typeof App !== "undefined") new App().init();
				if (typeof LayoutCustomizer !== "undefined") new LayoutCustomizer().init();
				if (typeof Plugins !== "undefined") new Plugins().init();
				if (typeof I18nManager !== "undefined") new I18nManager().init();
				// if your custom_table needs manual init, do it here AFTER DOM append
				if (typeof CustomTable !== "undefined") {
					// new CustomTable(); // uncomment if required
				}
			} catch (err) {
				console.error("Theme init failed:", err);
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

					if (!frappe.issue_theme_details_page) frappe.issue_theme_details_page = {};
					frappe.issue_theme_details_page._inline_styles_backup = [];

					// Use instance._cache instead of undefined global variable
					const cache = instance._cache || { css: [], js: [] };
					cache.css.forEach(href => {
						const el = document.querySelector(`link[href="${href}"][data-issue-theme-details="true"]`);

						if (el) {
							el.remove();
							removed_css++;
						}
					});

					// fallback: if any leftover support_dashboard.css without tag
					document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
						const href = link.getAttribute('href') || "";
						if (href.includes("issue_theme_details.css")) {
							link.remove();
							removed_css++;
							//console.log("Removed leftover support_dashboard.css");
						}
					});

					cache.js.forEach(src => {
						const el = document.querySelector(`script[src="${src}"]`);
						const lower_src = src.toLowerCase();

						//Do NOT remove Popper — critical bootstrap dependency
						if (lower_src.includes("popper")) {
							console.warn("Skipping Popper REMOVE — global dependency:", src);
							return;
						}

						if (el) {
							el.remove();
							removed_js++;
							// console.log("Removed JS:", src);
						}
					});


					// --- 3. Remove inline <style> tags added dynamically ---
					document.querySelectorAll('style').forEach(el => {
						const text = el.textContent.trim();
						if (text.includes('.issue-theme-details') || text.includes('#issue-theme-details') || el.dataset.issueThemeDetails === "true") {
							frappe.issue_theme_details_page._inline_styles_backup.push(text);
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



				reapply() {
					//console.group("Reapplying new-issue assets");
					// re-inject CSS files from cache (avoid duplicates)
					(instance._cache.css || []).forEach(href => {
						if (!document.querySelector(`link[href="${href}"]`)) {
							const css = document.createElement('link');
							css.rel = 'stylesheet';
							css.href = href;
							css.dataset.issueThemeDetails = "true";
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
							s.dataset.issueThemeDetails = "true";
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


		bindEvent(issue) {
			// Action button click
			const me = this;
			$(this.wrapper).on("click", "[data-action='set_working_agent']", async function (e) {
				e.preventDefault();
				if (!issue) return frappe.msgprint("No issue selected.");

				const users = await frappe.call({
					method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_users_with_role",
					args: { role: "Tech Support" }
				});
				let user_list = users.message || [];
				// You can safely iterate over it
				user_list.forEach(u => {
					//console.log(u.name, u.full_name);
				});
				let dialog = new frappe.ui.Dialog({
					title: __("Set Working Agent"),
					fields: [
						{
							label: __("Select Agent"),
							fieldname: "working_agent",
							fieldtype: "Link",
							options: "User",
							reqd: 1,
							get_query: () => {
								return {
									query: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_users_with_role_query"
								};
							}
						}
					],
					primary_action_label: __("Assign"),
					primary_action(values) {
						//console.log("here i am defining name", issue)
						frappe.call({
							method: "frappe.client.set_value",
							args: {
								doctype: "Issue",
								name: issue,
								fieldname: "working_agent",
								value: values.working_agent
							},
							callback: function (r) {
								if (!r.exc) {
									frappe.msgprint(
										__("Working agent updated to {0}", [values.working_agent])
									);
									dialog.hide();
									me.load_issue_details(issue);
								}
							}
						});
					}
				});
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

			$(document).on("click", "#change-status-btn", function () {
				if (!issue) {
					frappe.msgprint("No issue selected.");
					return;
				}

				// Open dialog to select new status
				let dialog = new frappe.ui.Dialog({
					title: "Change Issue Status",
					fields: [
						{
							label: "Select New Status",
							fieldname: "status",
							fieldtype: "Select",
							options: ["Open", "Working", "On Hold"],
							reqd: 1
						}
					],
					primary_action_label: "Update",
					primary_action(values) {
						frappe.call({
							method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.change_status", // path to your python method
							args: {
								doctype: "Issue",   // Change as needed
								name: issue,   // Replace with your document name
								new_status: values.status
							},
							freeze: true,
							freeze_message: "Updating status...",
							callback: function (r) {
								if (!r.exc) {
									frappe.msgprint("Status updated successfully!");
									dialog.hide();
									me.load_issue_details(issue);
								} else {
									frappe.msgprint("Something went wrong!");
								}
							}
						});
					}
				});

				dialog.show();
				setTimeout(() => {
					const closeBtn = dialog.get_close_btn();

					if (!closeBtn || !closeBtn.length) {
						//console.warn("No close button found in the dialog.");
						return;
					}
					//console.log("✔ Close button found:", closeBtn);
					closeBtn.off("click.dialog").on("click.dialog", function () {
						//console.log("🖱 Close button clicked → closing dialog");
						dialog.hide();
					});
				}, 50);


			});

			// 📧 Email button click
			$(this.wrapper).on("click", ".ti-mail", async function (e) {
				e.preventDefault();

				if (!issue) {
					frappe.msgprint("No issue selected.");
					return;
				}

				// 🔹 Fetch Issue details
				let issue_doc = await frappe.db.get_doc("Issue", issue);
				let customer = issue_doc.customer || null;

				// 🔹 Fetch contact + user email options
				let email_options = [];
				try {
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_contact_emails",
						args: { customer: customer }
					});
					email_options = res.message || [];
				} catch (err) {
					console.error("Error fetching contact emails:", err);
				}

				// Fallback email
				let default_email = issue_doc.raised_by || issue_doc.email_id || "";

				// 🔹 Create dialog
				let email_dialog = new frappe.ui.Dialog({
					title: __("Send Email"),
					fields: [
						{
							label: __("To"),
							fieldname: "recipients",
							fieldtype: "MultiSelect",
							reqd: 1,
							options: email_options,
							default: default_email,
							description: "Select one or more recipients"
						},
						{
							fieldtype: "HTML",
							fieldname: "cc_bcc_links",
							options: `
								<div style="margin-top:-10px; font-size:12px;">
									<a href="#" class="add-cc">${__("Add CC")}</a> |
									<a href="#" class="add-bcc">${__("Add BCC")}</a>
								</div>
							`
						},
						{
							label: __("CC"),
							fieldname: "cc",
							fieldtype: "MultiSelect",
							options: email_options,
							hidden: 1
						},
						{
							label: __("BCC"),
							fieldname: "bcc",
							fieldtype: "MultiSelect",
							options: email_options,
							hidden: 1
						},
						{
							label: __("Subject"),
							fieldname: "subject",
							fieldtype: "Data",
							default: `Re: ${issue_doc.subject || issue_doc.name}`,
							reqd: 1
						},
						{
							label: __("Message"),
							fieldname: "content",
							fieldtype: "Text Editor",
							reqd: 1
						},
						{
							label: __("Attach Files"),
							fieldname: "attachments",
							fieldtype: "Attach",
							multiple: 1
						}
					],
					primary_action_label: __("Send"),
					primary_action: function (values) {
						if (!values.recipients || !values.subject || !values.content) {
							frappe.msgprint("Please fill in all required fields.");
							return;
						}

						let recipients = Array.isArray(values.recipients)
							? values.recipients.join(", ")
							: values.recipients;
						let cc = Array.isArray(values.cc) ? values.cc.join(", ") : values.cc;
						let bcc = Array.isArray(values.bcc) ? values.bcc.join(", ") : values.bcc;

						frappe.call({
							method: "frappe.core.doctype.communication.email.make",
							args: {
								recipients: recipients,
								cc: cc,
								bcc: bcc,
								subject: values.subject,
								content: values.content,
								doctype: "Issue",
								name: issue,
								send_email: 1
							},
							freeze: true,
							freeze_message: "Sending email...",
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("✅ Email sent successfully!"),
										indicator: "green"
									});
									email_dialog.hide();
								} else {
									frappe.msgprint("Failed to send email.");
								}
							}
						});
					}
				});

				// 🔹 Handle CC/BCC show/hide (ERPNext style)
				email_dialog.$wrapper.find(".add-cc").on("click", function (e) {
					e.preventDefault();
					const cc_field = email_dialog.get_field("cc");
					cc_field.df.hidden = 0; // make visible
					cc_field.refresh(); // re-render field
					$(this).hide();
				});

				email_dialog.$wrapper.find(".add-bcc").on("click", function (e) {
					e.preventDefault();
					const bcc_field = email_dialog.get_field("bcc");
					bcc_field.df.hidden = 0;
					bcc_field.refresh();
					$(this).hide();
				});


				email_dialog.show();
				setTimeout(() => {
					const closeBtn = email_dialog.get_close_btn();
					if (!closeBtn || !closeBtn.length) {
						return;
					}
					closeBtn.off("click.email_dialog").on("click.email_dialog", function () {
						email_dialog.hide();   // ✅ FIXED
					});
				}, 50);
			});

		}


		bindTagEvents(issue, leftCol, rightCol) {
			const issue_name = issue;
			const self = this;

			// Render lucide icons if available
			if (window.lucide) lucide.createIcons();

			// ---------------------------
			// 1) Task count badge
			frappe.call({
				method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_tasks_with_children",
				args: { issue_name },
				callback: function (r) {
					const tasks = r.message || [];
					const count = tasks.length;

					const tag = $(".tag-item[data-doctype='Task']");
					tag.find(".task-count").remove();

					if (count > 0) {
						tag.find(".tag-text").after(`
							<span class="badge bg-light px-2 py-1 text-dark me-1 fw-semibold shadow-sm task-count"
								style="cursor:pointer;">
								${count}
							</span>
						`);
					}
				}
			});

			// ---------------------------
			// 4) Render Task panel
			// ---------------------------
			// ---------------------------
			// 2) Render Task panel
			// ---------------------------

			$(document).off("click", "#add-task-btn").on("click", "#add-task-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				handleNewTaskClick();
			});

			$(document).off("click", ".task-open").on("click", ".task-open", function () {
				frappe.set_route("Form", "Task", $(this).data("name"));
			});


			// -------------------------
			// MAIN FUNCTION
			// -------------------------
			async function renderTaskPanel(issue_name) {

				// Fetch tasks
				const taskRes = await frappe.call({
					method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_tasks_with_children",
					args: { issue_name },
					silent: true
				});

				const tasks = taskRes.message || [];
				const canCreateTask = frappe.model.can_create("Task");

				// No tasks
				if (!tasks.length) {
					renderRightCard("Tasks", `<p class="text-muted text-center">No tasks found.</p>`,
						canCreateTask ? taskButtonHTML() : ""
					);
					return;
				}

				// Collect unique user IDs
				const uniqueUsers = [...new Set(
					tasks.flatMap(t => (t.custom_users || []).map(u => u.user)).filter(Boolean)
				)];

				// Batch fetch user details
				const userMap = await fetchUserMap(uniqueUsers);

				// Build task cards HTML
				const html = tasks.map(t => buildTaskCardHTML(t, userMap)).join("");

				// Render card
				renderRightCard("Tasks", html, canCreateTask ? taskButtonHTML() : "");

				// Fill avatars AFTER DOM render
				fillTaskAvatars(tasks, userMap);
			}


			// -------------------------
			// HTML BUILDERS
			// -------------------------
			function taskButtonHTML() {
				return `<button class="btn btn-sm btn-primary" id="add-task-btn">+ New Task</button>`;
			}

			function buildTaskCardHTML(t, userMap) {
				const safeId = frappe.utils.escape_html(t.name.replace(/[^a-zA-Z0-9-_]/g, "_"));

				return `
					<div id="task-card-${safeId}" class="task-card p-1 mb-2 rounded-3 shadow-sm"
						style="background:#f8f9fa; border:1px solid #eee;">

						<div class="d-flex justify-content-between align-items-center">
							<div style="width:70%;">
								<div class="fw-bold text-primary mb-1" style="font-size:16px;">
									${frappe.utils.escape_html(t.subject || "")}
								</div>
							</div>
							<div style="width:30%; display:flex; justify-content:end;">
								<div class="avatar-holder" id="avatar-${safeId}"
									style="min-width:60px;text-align:right;"></div>
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center">
							<span class="task-open" data-name="${frappe.utils.escape_html(t.name)}" style="cursor:pointer;">
								${frappe.utils.escape_html(t.name)}
							</span>
							<span class="badge bg-warning text-dark">${t.status || ""}</span>
							<span class="badge bg-info text-dark">${t.priority || ""}</span>
						</div>

						${t.description ? `
							<div class="task-desc" style="width:100%;max-height:200px;overflow:auto;
								border:1px solid #efefef;margin-top:5px;padding:5px;">
								${t.description}
							</div>
						` : ""}
					</div>
				`;
			}


			// -------------------------
			// AVATAR LOGIC
			// -------------------------
			function fillTaskAvatars(tasks, userMap) {
				tasks.forEach(t => {
					const safeId = t.name.replace(/[^a-zA-Z0-9-_]/g, "_");
					const holder = document.getElementById(`avatar-${safeId}`);
					if (!holder) return;

					const assigned = (t.custom_users || [])
						.map(u => userMap[u.user])
						.filter(Boolean);

					holder.innerHTML = buildAvatarGroup(assigned);
				});
			}

			function buildAvatarGroup(users) {
				if (!users?.length) return "";

				const shown = users.slice(0, 2);
				const extra = users.length - shown.length;

				return `
					<div style="display:flex;justify-content:end;align-items:center;">
						${shown.map((u, i) =>
					`<div style="margin-left:${i === 0 ? "0" : "-8px"};">${buildAvatar(u)}</div>`
				).join("")}

						${extra > 0 ? `
							<div class="extra-count-avatar"
								title="${users.slice(2).map(u => u.full_name).join(", ")}"
								style="margin-left:-8px; width:22px; height:22px; border-radius:50%;
								background:#6c757d; color:white; font-size:10px; 
								display:flex; align-items:center; justify-content:center; font-weight:600;">
								+${extra}
							</div>
						` : ""}
					</div>
				`;
			}

			function buildAvatar(user) {
				if (user.image) {
					return `<img src="${user.image}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;">`;
				}

				const initials = getInitials(user.full_name);
				return `
					<span style="display:flex;align-items:center;justify-content:center;
						width:18px;height:18px;border-radius:50%;background:#4A81D4;
						color:white;font-weight:600;font-size:10px;">
						${initials}
					</span>
				`;
			}

			function getInitials(name) {
				const p = (name || "User").trim().split(/\s+/);
				return ((p[0]?.[0] || "U") + (p[1]?.[0] || "")).toUpperCase();
			}


			// -------------------------
			// DATA HELPERS
			// -------------------------
			async function fetchUserMap(users) {
				if (!users.length) return {};

				const res = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { name: ["in", users] },
						fields: ["name", "full_name", "user_image"],
						limit_page_length: 200
					},
					silent: true
				});

				const map = {};
				(res.message || []).forEach(u => {
					map[u.name] = {
						full_name: u.full_name,
						image: u.user_image
					};
				});
				return map;
			}


			// -------------------------
			// NEW TASK DIALOG
			// -------------------------
			function handleNewTaskClick() {
				//console.log("New Task Clicked");

				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { enabled: 1 },
						fields: ["name", "full_name"],
						order_by: "full_name",
						limit_page_length: 0
					},
					callback: function (res) {

						const users = res.message || [];

						const d = frappe.prompt([
							{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: true },
							{
								label: "Assign To",
								fieldname: "assign_to",
								fieldtype: "MultiSelect",
								options: users.map(u => u.full_name).join(",\n")
							},
							{ label: "Description", fieldname: "description", fieldtype: "Small Text" }
						], function (values) {

							const selected = (values.assign_to || "")
								.split(",")
								.map(v => v.trim())
								.filter(Boolean);

							const map = {};
							users.forEach(u => map[u.full_name] = u.name);

							const childRows = selected.map(s => ({ user: map[s] }));

							frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "Task",
										subject: values.subject,
										description: values.description || "",
										issue: issue_name,
										custom_users: childRows
									}
								},
								callback: function () {
									frappe.show_alert("Task created", "green");
									renderTaskPanel(issue_name);
									self.bindTagEvents(issue_name, leftCol, rightCol);
								}
							});

						}, "New Task");
						setTimeout(() => {
							try {
								if (d && d.get_close_btn) {

									d.get_close_btn().off("click").on("click", () => d.hide());
								} else {
									$(".modal:visible .btn-modal-close").off("click").on("click", () => {
										$(".modal:visible").modal("hide");
										$(".modal-backdrop").remove();
									});
								}
							} catch (err) {
								console.error("Failed to bind dialog close:", err);
							}
						}, 50);
					}

				});
			}




			// ---------------------------
			// 3) Render call panel
			// ---------------------------

			// ------- helper: get customer sales person (kept async) -------
			async function getCustomerSalesPerson(customer) {
				if (!customer) return "";

				const res = await frappe.call({
					method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_customer_sales_person",
					args: { customer },
					silent: true
				});

				return res.message || "";
			}

			async function updateCallListCount(issue_name) {
				const tag = $(".tag-item[data-doctype='Call List']");
				tag.find(".call-list-count").remove();

				const canRead = frappe.model.can_read("Call List");
				if (!canRead) {
					tag.hide();
					return;
				}
				tag.show();
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_permitted_call_list",
					args: { issue_name },
					silent: true
				});
				const list = res.message || [];
				if (list.length > 0) {
					tag.find(".tag-text").after(`
						<span class="badge bg-light px-2 py-1 text-dark me-1 fw-semibold shadow-sm call-list-count">
							${list.length}
						</span>
					`);
				}
			}

			updateCallListCount(issue_name);

			// OPEN CALL FORM
			$(document).off("click", ".call-open").on("click", ".call-open", function () {
				frappe.set_route("Form", "Call List", $(this).data("name"));
			});

			// ADD NEW CALL LIST
			$(document).off("click", "#add-call-btn").on("click", "#add-call-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				openNewCallDialog(issue_name);
			});

			const esc = frappe.utils.escape_html;

			function safeId(v) {
				return String(v).replace(/[^a-zA-Z0-9-_]/g, "_");
			}

			function formatDate(dt) {
				if (!dt) return "";
				let s = String(dt);
				if (s.includes(" ")) s = s.split(" ")[0];
				if (s.includes("T")) s = s.split("T")[0];
				const [y, m, d] = s.split("-");
				return `${d}-${m}-${y}`;
			}

			function formatTime(t) {
				if (!t) return "";
				let s = String(t);
				if (s.includes(" ")) s = s.split(" ")[1];
				if (s.includes("T")) s = s.split("T")[1];
				if (s.includes(".")) s = s.split(".")[0];
				return s;
			}

			async function renderCallListPanel(issue_name) {

				// Permission check
				if (!frappe.model.can_read("Call List")) {
					renderRightCard(
						"Call List",
						`<p class="text-muted text-center mt-3">You do not have permission to view Call List.</p>`
					);
					return;
				}

				// 1 SERVER CALL ONLY
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_permitted_call_list",
					args: { issue_name },
					silent: true
				});

				const list = res.message || [];
				const canCreate = frappe.model.can_create("Call List");

				// No items
				if (!list.length) {
					renderRightCard("Call List",
						`<p class="text-muted text-center mt-3">No Call Lists found.</p>`,
						canCreate ? callListButton() : ""
					);
					return;
				}

				// Build HTML
				const html = list.map(buildCallCard).join("");

				// Render card container
				renderRightCard("Call List", html, canCreate ? callListButton() : "");

				// Lazy-load avatars
				loadCallAvatars(list);
			}

			function callListButton() {
				return `<button class="btn btn-sm btn-primary" id="add-call-btn">+ New Call List</button>`;
			}

			function buildCallCard(c) {
				const id = safeId(c.name);

				return `
					<div class="call-card p-2 mb-2 rounded-3 shadow-sm"
						style="background:#f8f9fa; border:1px solid #e6e6e6;">

						<div class="d-flex justify-content-between align-items-center mb-1">
							<div class="fw-bold text-primary" style="font-size:16px;">
								${esc(c.subject)}
							</div>
							<div id="avatar-${id}">
								${simpleInitialAvatar(c.owner)}
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center mb-1">
							<span class="text-dark ellipsis" title="${esc(c.name1)}">${esc(c.name1 || "")}</span>

							<span class="call-open badge bg-light p-1"
								data-name="${esc(c.name)}"
								style="border:1px solid #dadada;cursor:pointer;font-size:12px;color:#4c4c5c;">
								${esc(c.name)}
							</span>
						</div>

						<div class="row g-2 small">
							<div class="col-6">
								${c.start_date ? `<div><i class="ti ti-calendar text-warning me-1"></i>${esc(formatDate(c.start_date))}</div>` : ""}
								${c.start_timing ? `<div><i class="ti ti-clock text-primary me-1"></i>${esc(formatTime(c.start_timing))}</div>` : ""}
							</div>

							<div class="col-6">
								${c.end_date ? `<div><i class="ti ti-calendar-event text-warning me-1"></i>${esc(formatDate(c.end_date))}</div>` : ""}
								${c.end_timing ? `<div><i class="ti ti-clock text-primary me-1"></i>${esc(formatTime(c.end_timing))}</div>` : ""}
							</div>
						</div>

						${c.description ? `
							<div class="p-2 mt-2 rounded" style="border:1px solid #eee;background:#fafafa;max-height:200px;overflow:auto;">
								${esc(c.description)}
							</div>
						` : ""}
					</div>
				`;
			}

			function simpleInitialAvatar(owner) {
				const init = (owner || "U").substring(0, 2).toUpperCase();
				return `
					<span class="avatar-wrapper"
						style="width:22px;height:22px;border-radius:50%;background:#4A81D4;color:#fff;
						display:flex;align-items:center;justify-content:center;font-size:11px;">
						${esc(init)}
					</span>`;
			}

			async function loadCallAvatars(list) {
				if (!frappe.model.can_read("User")) return;

				const owners = [...new Set(list.map(x => x.owner))];

				// Batch user fetch — ONE CALL
				const res = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { name: ["in", owners] },
						fields: ["name", "full_name", "user_image"],
						limit_page_length: owners.length
					},
					silent: true
				});

				const map = {};
				(res.message || []).forEach(u => (map[u.name] = u));

				// Apply avatars
				list.forEach(c => {
					const u = map[c.owner];
					const id = safeId(c.name);
					const holder = document.getElementById(`avatar-${id}`);
					if (!holder) return;

					if (u?.user_image) {
						holder.innerHTML = `
							<span class="avatar-wrapper" title="${esc(u.full_name)}"
								style="width:22px;height:22px;border-radius:50%;overflow:hidden;display:flex;">
								<img src="${u.user_image}" style="width:100%;height:100%;object-fit:cover;">
							</span>`;
					} else {
						const initials = (u?.full_name || c.owner).split(" ")
							.map(w => w[0]).join("").substring(0, 2).toUpperCase();

						holder.innerHTML = `
							<span class="avatar-wrapper" title="${esc(u?.full_name || c.owner)}"
								style="width:22px;height:22px;border-radius:50%;background:#4A81D4;color:#fff;
								display:flex;align-items:center;justify-content:center;font-size:11px;">
								${initials}
							</span>`;
					}
				});
			}

			async function openNewCallDialog(issue_name) {

				// Load default customer from the Issue
				const issue = await frappe.call({
					method: "frappe.client.get_value",
					args: {
						doctype: "Issue",
						filters: { name: issue_name },
						fieldname: ["customer"]
					},
					silent: true
				});

				const default_customer = issue.message?.customer || "";

				const d = frappe.prompt([
					{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: true },
					{ fieldtype: "Section Break" },

					{ label: "Related To", fieldname: "related_to", fieldtype: "Select", options: ["Customer", "Contact"], default: "Customer" },
					{ fieldtype: "Column Break" },

					{ label: "Full Name", fieldname: "name1", fieldtype: "Dynamic Link", options: "related_to", reqd: true, default: default_customer },

					{ fieldtype: "Section Break" },
					{ label: "Start Date", fieldname: "start_date", fieldtype: "Date" },
					{ fieldtype: "Column Break" },
					{ label: "Start Time", fieldname: "start_timing", fieldtype: "Time" },

					{ fieldtype: "Section Break" },
					{ label: "End Date", fieldname: "end_date", fieldtype: "Date" },
					{ fieldtype: "Column Break" },
					{ label: "End Time", fieldname: "end_timing", fieldtype: "Time" },

					{ fieldtype: "Section Break" },
					{ label: "Description", fieldname: "description", fieldtype: "Small Text" }
				],
					async function (v) {

						// Find sales person for customer
						const sales_person = (v.related_to === "Customer" && v.name1)
							? await getCustomerSalesPerson(v.name1)
							: "";

						const doc = {
							doctype: "Call List",
							subject: v.subject,
							name1: v.name1,
							related_to: v.related_to,
							description: v.description,
							issue_id: issue_name,
							custom_date: frappe.datetime.get_today(),
							start_date: v.start_date,
							end_date: v.end_date,
							start_timing: v.start_timing,
							end_timing: v.end_timing,
							custom_sales_person: sales_person
						};

						// Insert call
						const insert = await frappe.call({
							method: "frappe.client.insert",
							args: { doc }
						});

						const callName = insert.message.name;

						// Add Sales Team child row
						const userInfo = await frappe.call({
							method: "frappe.client.get_value",
							args: {
								doctype: "User",
								filters: { name: frappe.session.user },
								fieldname: ["full_name", "email", "mobile_no", "phone"]
							}
						});

						const u = userInfo.message || {};

						await frappe.call({
							method: "frappe.client.insert",
							args: {
								doc: {
									parent: callName,
									parenttype: "Call List",
									parentfield: "sales_team",
									doctype: "Sales Team",
									sales_person: u.full_name || frappe.session.user,
									mobile_no: u.mobile_no || u.phone,
									email_id: u.email
								}
							}
						});

						frappe.show_alert("Call created", "green");
						renderCallListPanel(issue_name);
						self.bindTagEvents(issue_name, leftCol, rightCol);
					},
					"New Call List");
				setTimeout(() => {
					const related_to_field = d.fields_dict.related_to.$input;
					const name1_field = d.fields_dict.name1;

					related_to_field.on("change", function () {
						const val = related_to_field.val();

						if (val === "Customer") {
							// Set issue customer
							name1_field.set_value(default_customer);
						} else {
							// Clear for Contact
							name1_field.set_value("");
						}
					});
				}, 300);
				setTimeout(() => {
					try {
						if (d && d.get_close_btn) {
							d.get_close_btn().off("click").on("click", () => d.hide());
						} else {
							$(".modal:visible .btn-modal-close").off("click").on("click", () => {
								$(".modal:visible").modal("hide");
								$(".modal-backdrop").remove();
							});
						}
					} catch (err) {
						console.error("Failed to bind dialog close:", err);
					}
				}, 50);

			}


			// ---------------------------
			// 6) Tag click handler (Task, Call List, call-list-count, task-count)
			// ---------------------------
			$(document)
				.off("click", ".tag-item .tag-text, .tag-item .task-count, .tag-item .call-list-count")
				.on("click", ".tag-item .tag-text, .tag-item .task-count, .tag-item .call-list-count", function () {
					const doctype = $(this).closest(".tag-item").data("doctype");
					if (!doctype) return;

					if (doctype.toLowerCase() === "task") {
						renderTaskPanel(issue_name);
						return;
					}

					if (doctype.toLowerCase() === "call list") {
						renderCallListPanel(issue_name);
						return;
					}
				});

			$(document)
				.off("click", ".tag-item .tag-texts")
				.on("click", ".tag-item .tag-texts", function () {
					const html = `
						<div id="notes-panel">
							<div id="notes-list" class="mt-2"></div>
						</div>
					`;
					let noteBtn = `<button class="btn btn-sm btn-primary" id="add-note-btn">+ New Note</button>`;

					renderRightCard("Quick Notes", html, noteBtn);
					self.loadAndRenderNotes(issue_name, rightCol.find(".sla-body"));
				});


			rightCol
				.off("click", "#add-note-btn")
				.on("click", "#add-note-btn", function () {
					const d = frappe.prompt(
						[{ label: "Note", fieldname: "note", fieldtype: "Small Text", reqd: true }],
						function (values) {
							frappe.call({
								method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.add_issue_note",
								args: { issue_name, note_text: values.note },
								callback: function (r) {
									if (r.message?.notes) self.renderNotesList(r.message.notes);
								}
							});
						},
						"Add Note"
					);
					setTimeout(() => {
						try {
							if (d && d.get_close_btn) {
								d.get_close_btn().off("click").on("click", () => d.hide());
							} else {
								$(".modal:visible .btn-modal-close").off("click").on("click", () => {
									$(".modal:visible").modal("hide");
									$(".modal-backdrop").remove();
								});
							}
						} catch (err) {
							console.error("Failed to bind dialog close:", err);
						}
					}, 50);
				});

			rightCol
				.off("click", ".note-edit")
				.on("click", ".note-edit", function () {
					const idx = $(this).data("idx");
					const currentText = $(this).closest(".note-card").find(".note-text").text().trim();

					const d = frappe.prompt(
						[{ label: "Edit Note", fieldname: "note", fieldtype: "Small Text", default: currentText }],
						function (values) {
							frappe.call({
								method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.update_issue_note",
								args: { issue_name, idx, note_text: values.note },
								callback: function (r) {
									if (r.message?.notes) self.renderNotesList(r.message.notes);
								}
							});
						},
						"Edit Note"
					);
					setTimeout(() => {
						try {
							if (d && d.get_close_btn) {
								d.get_close_btn().off("click").on("click", () => d.hide());
							} else {
								$(".modal:visible .btn-modal-close").off("click").on("click", () => {
									$(".modal:visible").modal("hide");
									$(".modal-backdrop").remove();
								});
							}
						} catch (err) {
							console.error("Failed to bind dialog close:", err);
						}
					}, 50);
				});

			function waitForConfirmModal(callback) {
				let tries = 0;
				const maxTries = 20;

				const check = () => {
					const $modal = $(".modal:visible");
					if ($modal.length) {
						callback($modal);
					} else if (tries < maxTries) {
						tries++;
						setTimeout(check, 20);
					}
				};

				check();
			}

			rightCol
				.off("click", ".note-delete")
				.on("click", ".note-delete", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const idx = $(this).data("idx");
					frappe.confirm(
						"Delete this note?",
						() => {
							frappe.call({
								method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.delete_issue_note",
								args: { issue_name, idx },
								callback: function (r) {
									if (r.message?.notes) self.renderNotesList(r.message.notes);
								}
							});
						}
					);
					waitForConfirmModal(($modal) => {
						const $close = $modal.find(".btn-modal-close");
						$close.off("click.note-confirm").on("click.note-confirm", function (ev) {
							ev.preventDefault();
							ev.stopPropagation();
							try {
								$modal.modal("hide");
							} catch (err) {
								$modal.removeClass("show in").hide();
							}
							$(".modal-backdrop").remove();
						});
					});
				});


			function renderRightCard(title, content, titleButtonHTML = "") {
				rightCol.show();
				leftCol.removeClass("col-lg-12").addClass("col-lg-8");

				rightCol.html(`
					<div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
						<div class="sla-header mb-2 pb-2 border-bottom d-flex justify-content-between align-items-center">
							<h5 class="sla-title fw-bold text-primary mb-0">${title}</h5>
							${titleButtonHTML}
						</div>
						<div class="sla-body">
							${content}
						</div>
					</div>
				`);
			}


		}



		/* helper to load notes from server and render */
		loadAndRenderNotes(issue_name, rightBody) {
			// show loading
			rightBody.find("#notes-list").html('<div style="text-align:center;color:#666;padding:12px;">Loading notes...</div>');

			const self = this;
			frappe.call({
				method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_issue_notes",
				args: { issue_name },
				callback: function (r) {
					const notes = (r.message && r.message.notes) || [];
					self.renderNotesList(notes);
				}
			});
		}

		/* render notes list into #notes-list */
		renderNotesList(notes) {
			const $list = $("#notes-list");
			$list.empty();

			if (!notes.length) {
				$list.html('<p style="color:#888;">No notes added yet.</p>');
				return;
			}

			// sort desc (newest first)
			notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

			notes.forEach((note) => {
				const initials = (note.created_by || note.owner || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
				const timestamp = note.timestamp ? frappe.datetime.str_to_user(note.timestamp) : '';
				const is_owner = frappe.session.user === note.owner;
				const is_admin = frappe.session.user === 'Administrator';

				// const action_buttons = `
				// 	${is_owner || is_admin ? `<a href="#" class="note-edit me-2" data-idx="${note.idx}">✏️</a>` : ''}
				// 	${is_admin ? `<a href="#" class="note-delete text-danger" data-idx="${note.idx}">🗑️</a>` : ''}
				// `;
				const action_buttons = `
            		${is_owner || is_admin ? `<button class="note-edit btn btn-sm btn-light me-2" data-idx="${note.idx}" style="border:none;background:none;">✏️</button>` : ''}
            		${is_admin ? `<button class="note-delete btn btn-sm btn-light text-danger" data-idx="${note.idx}" style="border:none;background:none;">🗑️</button>` : ''}
        		`;

				const user_avatar = `<div style="width:40px;height:40px;border-radius:50%;background:#007bff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;margin-right:10px;">${initials}</div>`;

				const html = `
					<div class="note-card mb-2 p-2" style="border:1px solid #eee;border-radius:8px;background:#f8f9fa;	">
						<div style="display:flex;justify-content:space-between;align-items:start;">
							<div style="display:flex;align-items:center;flex:1;">
								${user_avatar}
								<div style="flex:1;">
									<div class="text-muted">${frappe.utils.escape_html(note.created_by || note.owner || '')}</div>
									<div style="font-size:12px;color:#4c4c5c;">${frappe.utils.escape_html(note.custom_role || '')}</div>
								</div>
							</div>
							<div style="margin-left:10px;">${action_buttons}</div>
						</div>
						<div style="margin-top:10px;color:#333;max-height:200px;width:100%;overflow:auto;border:1px solid #efefef;" class="note-text p-1">
							${frappe.utils.escape_html(note.note)}
						</div>
						<div class="mt-2" style="display:flex; justify-content:flex-end;">
							<div style="font-size:12px; color:#777;">
								${timestamp}
							</div>
						</div>

					</div>
				`;
				$list.append(html);
			});
		}




		load_issue_details(issueName, page) {
			// --- Ensure columns exist ---
			const rightCol = $(".rightcol");
			const leftCol = $(".leftcol");

			// --- If issueName is missing or null ---
			if (!issueName) {
				console.warn("No issue name provided, hiding right column.");

				// Hide right column properly
				// rightCol.css("display", "none");
				// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
				rightCol.show();
				leftCol.removeClass("col-lg-12").addClass("col-lg-8");


				// Clear any previous content inside right panel
				rightCol.find(".card-title").text("");
				rightCol.find(".card-body").html(`
					<table class="table table-responsive">
						<thead></thead>
						<tbody></tbody>
					</table>
				`);

				//Force reflow (Bootstrap sometimes keeps hidden col space)
				leftCol.closest(".row").css("display", "flex");

				return; // stop here
			}

			// --- If issueName exists, continue normal flow ---
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Issue",
					name: issueName
				},
				callback: function (r) {
					if (!r.message) {
						console.warn("Issue not found, hiding right column.");
						// rightCol.hide();
						// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						rightCol.show();
						leftCol.removeClass("col-lg-12").addClass("col-lg-8");

						return;
					}
					const displayContainer = $("#issuedatadisplay");
					let issue = r.message;
					//console.log("issue", issue);
					window.issue_data = issue;
					function setTextAndTitle(id, value) {
						const val = value || "";
						$(`#${id}`).text(val).attr("title", val);
					}
					//$("#name").text(issue.name).attr("title", issue.name)
					// --- Fill details ---
					setTextAndTitle("name", issue.name);
					setTextAndTitle("customer", issue.customer);
					setTextAndTitle("subject", issue.subject);
					setTextAndTitle("issue-status", issue.status);
					setTextAndTitle("priority", issue.priority);
					setTextAndTitle("raised_by", issue.raised_by);
					setTextAndTitle("creation", frappe.datetime.str_to_user(issue.creation));
					setTextAndTitle("due_date", frappe.datetime.str_to_user(issue.response_by));
					$("#description").html(issue.description || "");


					let html = `
						<div class="row mb-4">
							${issue.department ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Department</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.department}">${issue.department}</span>
									</div>
								</div>
							`: ""}
							
							${issue.active_subscription ? `
								<div class="col-md-4 mb-2" style="cursor: pointer;" id="active_subscription-details">
									<h6 class="text-uppercase text-muted">Active Subscription</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.active_subscription}">${issue.active_subscription}</span>
									</div>
								</div>
							`: ""}
							
							${issue.working_agent ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Working Agent</h6>
									<div class="d-flex align-items-center gap-1">
										<div id="working_agent_avatar" class="rounded-circle avatar-sm d-flex align-items-center justify-content-center bg-secondary text-white"></div>
										<span class="ellipsis" title="${issue.working_agent}">${issue.working_agent}</span>
									</div>
								</div>
							`: ""}
					
							${issue.custom_query_type ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Query Type</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.custom_query_type}">${issue.custom_query_type}</span>
									</div>
								</div>
							`: ""}
							${issue.custom_support_type ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Support Type</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.custom_support_type}">${issue.custom_support_type}</span>
									</div>
								</div>
							`: ""}
							${issue.issue_contact_list?.length ? `
								<div class="col-md-4 mb-2" id="contact-list-details">
									<div class="d-flex align-items-center mb-1" style="gap: 6px;">
										<h6 class="text-uppercase text-muted mb-0" style="font-weight: 600; letter-spacing: 0.3px;">
											Contact Person
										</h6>
										<i class="ti ti-plus text-warning" 
											id="add-contact-btn" 
											title="Add Contact" 
											style="cursor: pointer; font-size: 16px; font-weight: 700;">
										</i>
									</div>
									<div class="d-flex align-items-start">
										<span id="contact_person" class="ellipsis w-100"></span>
									</div>
								</div>
							`: ""}
						</div>	
						
						
					`;
					displayContainer.html(html);


					// --- Working Agent Avatar ---
					if (issue.working_agent) {
						setTextAndTitle("working_agent", issue.working_agent);
						frappe.db.get_value("User", issue.working_agent, "user_image").then((res) => {
							const avatarDiv = $("#working_agent_avatar");
							const imageUrl = res.message?.user_image;
							if (imageUrl) {
								avatarDiv.css({
									"background-image": `url(${imageUrl})`,
									"background-size": "cover",
									"background-position": "center",
									"color": "transparent",
									"font-size": "0"
								}).text("");
							} else {
								const initials = issue.working_agent.slice(0, 2).toUpperCase();
								avatarDiv.css({
									"background-image": "none",
									"background-color": "#6c757d",
									"color": "#fff",
									"font-size": "0.9rem"
								}).text(initials);
							}
						});
					} else {
						setTextAndTitle("working_agent", "");
						$("#working_agent_avatar").css({
							"background-image": "none",
							"background-color": "#6c757d",
							"color": "#fff",
							"font-size": "0.9rem"
						}).text("");
					}

					// --- Default Layout ---
					// rightCol.hide();
					// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
					rightCol.show();
					leftCol.removeClass("col-lg-12").addClass("col-lg-8");


					$("#active_subscription-details").off("click").on("click", function () {
						if (!issue.active_subscription && (!issue.active_renewals || !issue.active_renewals.length)) {
							frappe.show_alert({ message: __("No active subscription found."), indicator: "orange" });
							return;
						}

						const isRightVisible = rightCol.is(":visible");
						const currentTitle = rightCol.find(".sla-title").text().trim();
						// if (isRightVisible && currentTitle.startsWith("Active Subscription")) {
						// 	rightCol.hide();
						// 	leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						// 	return;
						// }


						const renderActiveRenewals = (rows) => {
							let html = "";
							let cardTitle = "";

							if (rows.length) {
								rows.forEach((row, idx) => {
									// Use the first item's name as the title
									if (idx === 0 && row.item) cardTitle = row.renewal_id || "";

									html += `
										<div class="subscription-item rounded mb-2">
											${row.item ? `
											<div class="detail-item p-2 mb-1">
												<i class="ti ti-package text-success"></i>
												<div class="detail-text">
													<label>Item</label>
													<span>${row.item}</span>
												</div>
											</div>` : ""}

											${row.end_date ? `
											<div class="detail-item p-2 mb-1">
												<i class="ti ti-calendar text-warning"></i>
												<div class="detail-text">
													<label>End Date</label>
													<span>${frappe.datetime.str_to_user(row.end_date)}</span>
												</div>
											</div>` : ""}
										</div>
									`;
								});
							} else {
								html = `<p class="text-muted text-center">No renewals found.</p>`;
							}

							renderRightCard(
								`<div class="sla-title pl-3 pr-3">
									<i class="ti ti-file-invoice text-primary me-1"></i>
									<div class="sla-title-text">
										<div class="sla-subtitle">Active Subscription</div>
										<div class="">${cardTitle}</div>
									</div>
								</div>`,
								html
							);

						};

						if (issue.active_renewals && issue.active_renewals.length) {
							renderActiveRenewals(issue.active_renewals);
						} else {
							frappe.call({
								method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_active_subscription_for_issue",
								args: { issue_name: issue.name },
								callback: function (res) {
									const rows = res.message?.renewal_details || [];
									issue.active_renewals = rows;
									renderActiveRenewals(rows);
								}
							});
						}
					});


					if (issue.issue_contact_list?.length) {
						let html = "";
						issue.issue_contact_list.forEach((row, i) => {
							const name = (row.user_name || "").split("-")[0].trim();
							if (name) {
								html += `
									<div class="contact-entry" 
										style="display: flex; align-items: center; 
										width: 100%; padding: 0px 4px; margin-bottom: 1px;
										">
										
										<span class="contact-name text-primary" 
											style="cursor:pointer; display:inline-flex; align-items:center;"
											data-index="${i}">
											${frappe.utils.escape_html(name)}
										</span>

										<i class="ti ti-trash text-danger delete-contact" 
											style="cursor:pointer; font-size:13px; margin-left:3px;" 
											title="Remove Contact"
											data-rowname="${row.name}"></i>
									</div>`;

							}
						});

						$("#contact-list-details span.ellipsis").html(html);
						//Ensure the contact column is visible if data exists
						$("#contact-list-details").closest(".col-md-4").show();

						// 👇 CSS hover effect (icon only visible on hover)
						$(`<style>
							.contact-entry:hover .delete-contact {
								display: inline-block !important;
							}
						</style>`).appendTo("head");
					} else {
						$("#contact-list-details span.ellipsis").text("").attr("title", "");
					}

					// ---------------- CLICK HANDLER FOR INDIVIDUAL CONTACTS ----------------
					$("#contact-list-details").off("click", ".contact-name").on("click", ".contact-name", async function () {
						//if (window.preventRightPanelAutoHide) return;
						const index = $(this).data("index");
						const updatedIssue = await frappe.db.get_doc("Issue", issueName);
						const row = updatedIssue.issue_contact_list[index];
						//const row = issue.issue_contact_list[index];
						if (!row) return;

						const selectedName = (row.user_name || "").split("-")[0].trim();
						const isRightVisible = rightCol.is(":visible");
						const currentTitle = rightCol.find(".sla-title").text().trim();

						// if (isRightVisible && currentTitle === selectedName) {
						// if (isRightVisible && currentTitle.startsWith(selectedName)) {
						// 	rightCol.hide();
						// 	leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						// 	return;
						// }
						let html = `
							<div class="contact-details-modern space-y-3">
								${row.email_id ? `
								<div class="detail-item">
									<i class="ti ti-mail text-primary"></i>
									<div class="detail-text">
										<label>Email</label>
										<span>${row.email_id}</span>
									</div>
								</div>` : ""}
								
								${row.mobile_no ? `
								<div class="detail-item">
									<i class="ti ti-phone text-success"></i>
									<div class="detail-text">
										<label>Mobile No</label>
										<span>${row.mobile_no}</span>
									</div>
								</div>` : ""}
								
								${row.designation ? `
								<div class="detail-item">
									<i class="ti ti-id text-warning"></i>
									<div class="detail-text">
										<label>Designation</label>
										<span>${row.designation}</span>
									</div>
								</div>` : ""}
							</div>
						`;

						renderRightCard(
							`<div class="sla-title pl-3 pr-3">
									<i class="ti ti-user text-primary me-1"></i>
									<div class="sla-title-text">
										<div class="">${selectedName}</div>
									</div>
								</div>`,
							html
						);


					});
					// ---- DEFAULT RIGHT PANEL CONTENT (Contact Person) ----
					function loadDefaultRightPanel() {
						// If contact exists, load first contact
						if (issue.issue_contact_list && issue.issue_contact_list.length > 0) {
							const first = issue.issue_contact_list[0];
							const name = (first.user_name || "").split("-")[0].trim();
							let html = `
								<div class="contact-details-modern space-y-3">
									${first.email_id ? `
									<div class="detail-item">
										<i class="ti ti-mail text-primary"></i>
										<div class="detail-text">
											<label>Email</label>
											<span>${first.email_id}</span>
										</div>
									</div>` : ""}
									
									${first.mobile_no ? `
									<div class="detail-item">
										<i class="ti ti-phone text-success"></i>
										<div class="detail-text">
											<label>Mobile No</label>
											<span>${first.mobile_no}</span>
										</div>
									</div>` : ""}
									
									${first.designation ? `
									<div class="detail-item">
										<i class="ti ti-id text-warning"></i>
										<div class="detail-text">
											<label>Designation</label>
											<span>${first.designation}</span>
										</div>
									</div>` : ""}
								</div>
							`;

							renderRightCard(
								`<i class="ti ti-user text-primary me-1"></i> <span>${name}</span>`,
								html
							);
						}
						else {
							renderRightCard(
								`<i class="ti ti-user-off text-danger"></i> No Contacts`,
								`<p class="text-muted">No contact details available.</p>`
							);
						}
					}

					loadDefaultRightPanel();



					// ------------------- ACTIVITY TIMELINE -------------------
					$("#add-comment-btn").off("click").on("click", function () {
						const text = $("#new-comment-input").val().trim();
						if (!text) {
							frappe.msgprint("Please enter a comment.");
							return;
						}
						frappe.call({
							method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.add_custom_comment",
							args: {
								docname: issueName,
								content: text
							},
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({ message: "Comment added", indicator: "green" });
									$("#new-comment-input").val("");
									loadActivityTimeline(issueName);
								}
							}
						});
					});

					// helper to decide whether content is "full html/email"
					function isFullHtml(content) {
						return /<html|<table|<body|<meta|<style|<head/i.test(content);
					}

					function buildStyledContent(rawHtml) {
						const injectedCSS = `
						<style>
							html, body {
								font-family: 'intervariable', 'inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
								color: #4c4c5c;
							}
							p, b, strong {
								font-size: 14px;
								color: #4c4c5c;
							}
							b {
								font-weight: 600;
							}
							
						</style>
					`;
						return injectedCSS + rawHtml;
					}
					function loadActivityTimeline(issueName) {
						frappe.call({
							method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_issue_activity",
							args: { issue_name: issue.name },
							callback: function (res) {
								const container = $("#activity-timeline");
								const activities = res.message || [];
								let html = "";

								if (activities.length) {
									activities.forEach(act => {
										// is_html flag says whether content contains HTML (email / full HTML)
										let descriptionContent = act.is_html
											? (act.description || "")
											: frappe.utils.escape_html(act.description || "");

										let descriptionHtml = "";

										if (isFullHtml(descriptionContent)) {
											// full HTML/email — inject a style into the srcdoc so iframe has our CSS
											const iframeId = "email-frame-" + (Math.random().toString(36).substr(2, 9));
											const styled = buildStyledContent(descriptionContent);
											// use JSON.stringify here to safely serialize srcdoc content
											descriptionHtml = `
										<div class="scrollable-description text-muted iframe-wrapper">
										<iframe id="${iframeId}" class="email-iframe" sandbox="allow-popups allow-scripts"></iframe>
										</div>
										<script>
										(function(){
											const ifr = document.getElementById("${iframeId}");
											if (!ifr) return;
											// set srcdoc with injected css
											ifr.srcdoc = ${JSON.stringify(styled)};
											ifr.onload = function () {
											try {
												const doc = ifr.contentDocument || ifr.contentWindow.document;
												const height = Math.min(doc.body.scrollHeight + 10, 400); // cap height
												ifr.style.height = height + "px";
											} catch (e) {
												// cross-origin or other issues — leave default height
											}
											};
										})();
										</script>
									`;
										} else {
											// plain/html fragment — inject the same style at the start of the fragment
											const styledFragment = buildStyledContent(descriptionContent);
											descriptionHtml = `
										<div class="scrollable-description text-muted">
										${styledFragment}
										</div>
									`;
										}

										html += `
									<div class="timeline-item d-flex align-items-stretch w-100">
										<div class="timeline-time pe-3 text-muted">${act.timestamp || ""}</div>
										<div class="timeline-dot bg-${act.color || "secondary"}"></div>
										<div class="timeline-content frappe-card ps-3 pb-4 mb-1 ml-1">
										<h6 class="mb-1 fs-sm text-muted">${act.title || ""}</h6>
										${descriptionHtml}
										<span class="text-primary d-block mt-2">By ${act.by || ""}</span>
										</div>
									</div>`;
									});
								} else {
									html = `<p class="text-muted text-center">No activity found for this issue.</p>`;
								}

								container.html(html);
							}
						});
					}
					loadActivityTimeline(issue.name);


					function renderRightCard(title, content) {
						rightCol.show();
						leftCol.removeClass("col-lg-12").addClass("col-lg-8");

						rightCol.html(`
							<div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
								<div class="sla-header mb-1 pb-1 border-bottom">
									<h5 class="sla-title fw-bold text-primary mb-0">${title}</h5>
								</div>
								
								<div class="sla-body">
									${content}
								</div>
							</div>
						`);
					}



					$("#sla-list-details").off("click").on("click", function () {
						const sla = issue.service_level_agreement;

						if (!sla) {
							frappe.show_alert({ message: __("No SLA details found."), indicator: "orange" });
							return;
						}

						const isRightVisible = rightCol.is(":visible");
						const currentTitle = rightCol.find(".sla-title").text().trim();

						const slaTitle = sla || "SLA Details";

						function formatDuration(seconds) {
							if (!seconds || isNaN(seconds)) return "";
							const days = Math.floor(seconds / (24 * 3600));
							seconds %= 24 * 3600;
							const hours = Math.floor(seconds / 3600);
							seconds %= 3600;
							const minutes = Math.floor(seconds / 60);
							const secs = Math.floor(seconds % 60);
							let parts = [];
							if (days) parts.push(`${days}d`);
							if (hours) parts.push(`${hours}h`);
							if (minutes) parts.push(`${minutes}m`);
							if (secs || parts.length === 0) parts.push(`${secs}s`);
							return parts.join(" ");
						}

						// --- Fetch first responder ---
						let first_responded_by = "";
						try {
							frappe.call({
								method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_first_responder",
								args: { issue_name: issue.name },
								async: false,
								callback: function (r) {
									if (r.message) {
										first_responded_by = r.message.first_responded_by || "";
									}
								}
							});
						} catch (e) {
							console.warn("Error fetching first responder:", e);
						}

						// --- Fetch who closed the ticket ---
						let closed_by = "";
						if (issue.status === "Closed") {
							try {
								frappe.call({
									method: "renewal_module.custom_module.page.issue_theme_details.issue_theme_details.get_closed_by_for_issue",
									args: { issue_name: issue.name },
									async: false,
									callback: function (r) {
										if (r.message && r.message.closed_by) {
											closed_by = r.message.closed_by;
										}
									}
								});
							} catch (e) {
								console.warn("Error fetching Closed By user:", e);
							}
						}

						const data = {
							service_level_agreement: issue.service_level_agreement || "",
							response_by: issue.response_by ? frappe.datetime.str_to_user(issue.response_by) : "",
							sla_resolution_by: issue.sla_resolution_by ? frappe.datetime.str_to_user(issue.sla_resolution_by) : "",
							first_responded_by: first_responded_by || "",
							closed_by: closed_by || "",
							first_responded_on: issue.first_responded_on ? frappe.datetime.str_to_user(issue.first_responded_on) : "",
							first_response_time: issue.first_response_time ? formatDuration(issue.first_response_time) : "",
							sla_resolution_date: issue.sla_resolution_date ? frappe.datetime.str_to_user(issue.sla_resolution_date) : "",
							resolution_time: issue.resolution_time ? formatDuration(issue.resolution_time) : "",
							user_resolution_time: issue.user_resolution_time ? formatDuration(issue.user_resolution_time) : "",
						};

						let responded_within_sla = false;
						if (issue.first_responded_on && issue.response_by) {
							const responseBy = frappe.datetime.str_to_obj(issue.response_by);
							const firstRespondedOn = frappe.datetime.str_to_obj(issue.first_responded_on);
							responded_within_sla = firstRespondedOn <= responseBy;
						}

						let resolved_within_sla = false;
						if (issue.sla_resolution_date && issue.sla_resolution_by) {
							const resolutionBy = frappe.datetime.str_to_obj(issue.sla_resolution_by);
							const resolvedOn = frappe.datetime.str_to_obj(issue.sla_resolution_date);
							resolved_within_sla = resolvedOn <= resolutionBy;
						}

						function splitDateTime(dtString) {
							if (!dtString) return "";
							let parts = dtString.split(" ");
							if (parts.length === 2) {
								return `<div class="sla-datetime"><div>${parts[0]}</div><div>${parts[1]}</div></div>`;
							} else {
								return `<div>${dtString}</div>`;
							}
						}

						let html = `
							<!-- Response Time -->
							${data.response_by && data.first_responded_on ? `
							<div class="sla-row">
								<div class="sla-label-row">
									<span>Response Due By</span>
									<span>Responded On
									${responded_within_sla
									? `<span class="sla-circle success" title="Within SLA"><i class="ti ti-check"></i></span>`
									: `<span class="sla-circle danger" title="Breached SLA"><i class="ti ti-x"></i></span>`}
									</span>
								</div>
								<div class="sla-value-row">
									${splitDateTime(data.response_by)}
									<span>${splitDateTime(data.first_responded_on)} <span>${data.first_responded_by}</span></span>
								</div>
							</div>` : ""}

							<!-- Resolution Time -->
							${data.sla_resolution_by && data.sla_resolution_date ? `
							<div class="sla-row">
								<div class="sla-label-row">
									<span>Resolution Due By</span>
									<span>Resolved On
									${resolved_within_sla
									? `<span class="sla-circle success" title="Within SLA"><i class="ti ti-check"></i></span>`
									: `<span class="sla-circle danger" title="Breached SLA"><i class="ti ti-x"></i></span>`}
									</span>
								</div>
								<div class="sla-value-row">
									<span>${splitDateTime(data.sla_resolution_by)}</span>
									<span>${splitDateTime(data.sla_resolution_date)} <span>${data.closed_by}</span></span>
								</div>
							</div>` : ""}

							<!-- Working Time -->
							${data.user_resolution_time ? `
							<div class="sla-row">
								<div class="sla-label-row single"><span>User Working Time</span></div>
								<div class="sla-value-row single"><span>${data.user_resolution_time}</span></div>
							</div>` : ""}
						`;

						//renderRightCard("SLA Details", html);
						renderRightCard(data.service_level_agreement || "SLA Details", html);

					});

					//more details
					$("#more-details-btn").off("click").on("click", function () {
						let html = ``;
						html += `
								<div class="contact-details-modern space-y-3">
									${issue.sales_person ? `
									<div class="detail-item">
										<i class="ti ti-user-check text-primary"></i>
										<div class="detail-text">
											<label>Salesperson</label>
											<span>${issue.sales_person}</span>
										</div>
									</div>` : ""}
									
									${issue.raised_by ? `
									<div class="detail-item">
										<i class="ti ti-user text-success"></i>
										<div class="detail-text">
											<label>Raised By</label>
											<span>${issue.raised_by}</span>
										</div>
									</div>` : ""}
								</div>
							`;
						renderRightCard("More Details", html);
					});


				}
			});
		}

		async show_work_timer(issue_name) {
			try {
				const res = await frappe.call({
					method: "renewal_module.custom_issue.get_issue_timer",
					args: { issue_id: issue_name }
				});

				if (!res || !res.message) return;

				//console.log("⏱️ Timer data:", res.message);

				const timerEl = document.getElementById("live-work-timer");
				if (!timerEl) return;

				// Clear existing interval
				if (window.issueLiveTimerInterval) clearInterval(window.issueLiveTimerInterval);

				// Get working seconds (if available)
				let seconds = res.message.working_seconds || 0;

				// Helper: format time HH:MM:SS
				function formatTime(secs) {
					const h = Math.floor(secs / 3600);
					const m = Math.floor((secs % 3600) / 60);
					const s = secs % 60;
					return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
				}

				timerEl.textContent = formatTime(seconds);

				const current_user = frappe.session.user;
				const issue_doc = await frappe.db.get_doc('Issue', issue_name);
				const working_agent = issue_doc.working_agent;

				const $timer = $(".custom-work-timer");
				const $startBtn = $(".custom-start-btn");

				// Hide all by default
				$startBtn.addClass("d-none");
				$timer.addClass("d-none");

				// Only proceed if current user = working_agent
				if (current_user !== working_agent) {
					//console.log("🚫 Current user not working agent");
					return;
				}

				const open_log_res = await frappe.call({
					method: "renewal_module.custom_issue.has_open_timelog",
					args: { issue_id: issue_name, user: current_user }
				});

				const has_open_log = open_log_res && open_log_res.message === true;

				if (has_open_log) {
					//console.log("🕒 Open time log found — starting live timer");
					$startBtn.addClass("d-none");
					$timer.removeClass("d-none");

					window.issueLiveTimerInterval = setInterval(() => {
						seconds++;
						timerEl.textContent = formatTime(seconds);
					}, 1000);
				} else {
					//console.log("▶️ No open time log — show Start button");
					$startBtn.removeClass("d-none");
				}


				// Start button click handler
				$startBtn.off("click").on("click", async () => {
					try {
						//console.log("🔘 Start clicked");
						$startBtn.addClass("d-none");
						$timer.removeClass("d-none");

						// Create new time log entry
						const start_time = frappe.datetime.now_datetime();

						await frappe.call({
							method: "renewal_module.issue_hooks.start_time_log",
							args: {
								issue: issue_name,

							}
						});

						// Start live timer
						seconds = 0;
						if (window.issueLiveTimerInterval) clearInterval(window.issueLiveTimerInterval);
						window.issueLiveTimerInterval = setInterval(() => {
							seconds++;
							timerEl.textContent = formatTime(seconds);
						}, 500);

						frappe.show_alert({ message: "Timer started", indicator: "green" });
					} catch (err) {
						console.error("Error creating time log:", err);
						frappe.msgprint("Failed to start timer.");
						$startBtn.removeClass("d-none");
						$timer.addClass("d-none");
					}
				});
			} catch (e) {
				console.error("Error fetching issue timer:", e);
			}
		}


	}
	//window.MyPage = issueThemeDetailsPage;
	window.issueThemeDetailsPage = issueThemeDetailsPage;


}


frappe.issue_theme_details_page = {
	body: `
        <div class="wrapper issue-theme-wrapper">

            <!-- ============================================================== -->
            <!-- Start Main Content -->
            <!-- ============================================================== -->
            <div class="content-page">

            <div class="container-fluid" style="background-color:#F3F4F6;">

				<div class="px-2">
					<div class="d-flex justify-content-end">
						<ol class="breadcrumb m-0 py-0">
							<li class="breadcrumb-item">Support</li>
							<li class="breadcrumb-item">
							<a href="/app/issue-theme">Issue Theme</a>
							</li>
						</ol>
					</div>
				</div>


				<div class="page-title-head p-2 d-flex justify-content-between align-items-center flex-wrap">

					<div class="d-flex align-items-center flex-grow-1 mb-2 mb-md-0" style="min-width: 0;">
						<h5 class="mb-0 d-flex align-items-center gap-1" style="min-width:0; max-width:100%;">
							<span id="name">#SUP-2523</span>
							<span class="mx-1 text-muted">—</span>
							<span id="customer" 
								class="text-ellipsis"
								style="flex-grow:1;"
								title="App freezes when uploading files">
								App freezes when uploading files
							</span>
						</h5>
					</div>

					
					<div class="right-actions d-flex align-items-center gap-2 flex-wrap text-end">
						<button id="sla-list-details" class="btn btn-primary btn-sm">
							SLA Details
						</button>
						<button id="change-status-btn" class="btn btn-success btn-sm">
							Change Status
						</button>
						<button id="custom-start-timer" class="btn btn-info btn-sm custom-start-btn d-none">
							Start
						</button>
						<div class="custom-work-timer d-none"
							style="background:#001f4d; color:white; padding:5px 5px; border-radius:5px; font-weight:bold; font-size:12px;">
							<span id="live-work-label">⏱️ Work Hrs:</span>
							<span id="live-work-timer">00:00:00</span>
						</div>
					</div>

				</div>

                

                <div class="row">
                    <div class="leftcol">
                        <div class="card">

							<div class="card-header d-flex justify-content-between align-items-center" style="border-bottom:none;">
								<div class="d-flex align-items-center">
									<h5 class="mb-0 d-flex align-items-center">
										<span class="text-muted ellipsis mr-1" id="subject" style="color:#4c4c5c !important;"></span>-
										<span class="badge bg-danger ms-1" id="priority"></span>
									</h5>
								</div>

								<div class="d-flex align-items-center gap-2">
									<span class="badge text-bg-warning me-1" id="issue-status" style="padding:3px;"></span>
									<span class="btn btn-secondary" style="cursor:pointer;font-size:12px;padding:5px;border:1px solid #ffffff;">
										<i class="ti ti-mail"></i>
									</span>
									<div class="dropdown" id="actions-dropdown">
										<button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="font-size:12px;border:1px solid #ffffff;">
											Actions
										</button>
										<ul class="dropdown-menu">
											<li class="user-action">
												<a class="dropdown-item" href="#" data-action="set_working_agent">Set working agent</a>
											</li>
										</ul>
									</div>
								</div>
							</div>



                            <div class="card-body">

								<div id="issuedatadisplay"></div>

                                <!-- Description -->
								<!--<div class="mb-4" id="description-section">
									<div class="d-flex align-items-center mb-1" style="gap: 6px;">
										<h6 class="text-uppercase text-muted mb-0" 
											style="font-weight: 600; letter-spacing: 0.3px;">
										Description
										</h6>
										<i class="ti ti-pencil text-warning" 
										id="editBtn"
										title="Edit Description"
										style="
											cursor: pointer; 
											font-size: 16px; 
											font-weight: 700;
											display: flex; 
											align-items: center; 
											justify-content: center;
											margin-top: 0px;
										">
										</i>
									</div>

									<div id="description-container" class="p-2 border rounded">
										<p class="mb-1" id="description"></p>
									</div>
								</div>-->

								<div class="mb-4" id="description-section">
									<div class="d-flex align-items-center justify-content-between mb-1" style="gap: 6px;">
										<h6 class="text-uppercase text-muted mb-0" 
											style="font-weight: 600; letter-spacing: 0.3px;">
										Description
										</h6>
										<button id="saveDescBtn" class="btn btn-success btn-sm d-none" title="Save Description" style="padding:0px 5px;">
											Save
										</button>


									</div>

									<div id="description-container" class="p-2" style="border:1px solid #E7E9EB; border-radius:5px;">
										<p class="mb-1" id="description"></p>
									</div>
								</div>

								<!--<i class="ti ti-check text-success d-none" id="saveDescBtn" title="Save Description" style="cursor: pointer; font-size: 16px; font-weight: 700;"></i>-->


                                <!-- Tags -->
								<div class="mb-4">
									<h6 class="text-uppercase text-muted mb-2">Connections</h6>
									<div class="d-flex flex-wrap gap-2">
										<div class="tag-item d-flex align-items-center" data-doctype="Task">
											<span class="badge bg-light px-2 py-1 text-dark  me-1 fw-semibold shadow-sm tag-text" style="cursor:pointer;">
												Tasks
											</span>
											<!--<span class="badge bg-light px-2 py-1 text-dark shadow-sm tag-add d-flex align-items-center justify-content-center" style="cursor:pointer;">
												<i data-lucide="plus"></i>
											</span>-->
										</div>


										<div class="tag-item d-flex align-items-center" data-doctype="Call List">
											<span class="badge bg-light px-2 py-1 tag-text me-1 fw-semibold text-dark shadow-sm" style="cursor:pointer;">Call List</span>
											<!--<span class="badge bg-light px-2 py-1 text-dark shadow-sm tag-add d-flex align-items-center justify-content-center" style="cursor:pointer;">
												<i data-lucide="plus"></i>
											</span>-->
										</div>

										<div class="tag-item d-flex align-items-center" data-doctype="issue">
											<span class="tag-texts badge bg-light text-dark shadow-sm px-2 py-1 me-1 fw-semibold" style="cursor:pointer;">Quick Notes</span>
										</div>

										<div class="d-flex align-items-center" id="more-details-btn">
											<span class="badge bg-light text-dark shadow-sm px-2 py-1 me-1 fw-semibold" style="cursor:pointer;">More</span>
										</div>

									</div>
								</div>


								<!--<div class="mb-4">
									<ul class="nav nav-tabs" id="issueTabs" role="tablist">
										<li class="nav-item" role="presentation">
											<button class="nav-link active" id="notes-tab" data-bs-toggle="tab" data-bs-target="#notes-tab-pane" type="button" role="tab" aria-controls="notes-tab-pane" aria-selected="true">
												Notes
											</button>
										</li>
										<li class="nav-item" role="presentation">
											<button class="nav-link" id="connections-tab" data-bs-toggle="tab" data-bs-target="#connections-tab-pane" type="button" role="tab" aria-controls="connections-tab-pane" aria-selected="false">
												Connections
											</button>
										</li>
									</ul>


									<div class="tab-content p-3 border border-top-0 rounded-bottom" id="issueTabsContent">
										<div class="tab-pane fade show active" id="notes-tab-pane" role="tabpanel" aria-labelledby="notes-tab">
											<h6 class="mb-3">Create a New Note</h6>
											<form id="new-note-form">
												<div class="mb-2">
													<input type="text" class="form-control" placeholder="Title" id="note-title">
												</div>
												<div class="mb-2">
													<textarea class="form-control" rows="3" placeholder="Write your note..." id="note-content"></textarea>
												</div>
												<button type="submit" class="btn btn-primary btn-sm">Add Note</button>
											</form>
										</div>

										<div class="tab-pane fade" id="connections-tab-pane" role="tabpanel" aria-labelledby="connections-tab">
											<h6 class="mb-3">Tasks</h6>
											<ul class="list-group" id="task-list">
											</ul>
										</div>
									</div>
								</div>-->

								<div class="mb-4">
									<div class="comment-section mt-3">
										<textarea id="new-comment-input" placeholder="Write a comment..." class="form-control" style="min-height:40px;">
										</textarea>
										<button id="add-comment-btn" class="btn btn-primary mt-2" style="padding:0px 5px;font-size:11px;">Add Comment</button>
									</div>
								</div>


								<!-- Activity Section -->
								<div class="mb-4">
									<h6 class="text-uppercase text-muted mb-4">Activity:</h6>
									<div class="timeline" id="activity-timeline">
										<p class="text-muted">Loading activity...</p>
									</div>
								</div>

                            </div>
                        </div>
                    </div> <!-- end col-->

					<div class="rightcol col-lg-4">
						<div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
						</div>
					</div>

                    
                </div>
                <!-- end row-->

            </div>
            <!-- container -->

            <!-- Footer Start -->
            <footer class="footer">
                <div class="container-fluid">
                    <div class="row">
                        <div class="col-12 text-center">
                            ©<span class="fw-semibold">64 Network Security Pvt Ltd</span>
                        </div>
                    </div>
                </div>
            </footer>
            <!-- end Footer -->
            <!-- ============================================================== -->
            <!-- End of Main Content -->
            <!-- ============================================================== -->

        </div>
        <!-- END wrapper -->

        <script>
            document.addEventListener("DOMContentLoaded", function () {
                const container = document.querySelector('#chat-container');
                if (container && container.SimpleBar) {
                    container.SimpleBar.getScrollElement().scrollTop = container.SimpleBar.getScrollElement().scrollHeight;
                } else {
                    // Fallback if not using custom SimpleBar instance
                    const scrollElement = container.querySelector('.simplebar-content-wrapper');
                    if (scrollElement) {
                        scrollElement.scrollTop = scrollElement.scrollHeight;
                    }
                }
            });
        </script>
        

    `}