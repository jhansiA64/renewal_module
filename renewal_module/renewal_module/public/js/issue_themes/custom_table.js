
// class Table {
//     constructor(e, t) {
//         this.table = e;
//         this.parentInstance = t;
//         this.thead = e.querySelector("thead");
//         this.tbody = e.querySelector("tbody");
//         this.headers = [];
//         if (this.thead) {
//             this.headers = Array.from(this.thead.querySelectorAll("th"));
//         }
//         this.rows = Array.from(this.tbody.querySelectorAll("tr"));
//         this.filteredRows = [...this.rows];
//         this._originalRows = [...this.rows]; // ✅ Keep a stable copy for pagination & filters
//         this.rowsPerPage = parseInt(e.getAttribute(this.parentInstance.rowsPerPageAttribute) ?? this.parentInstance.rowsPerPage);
//         this.currentPage = this.parentInstance.currentPage;
//         this.checkAllCheckBox = null;
//         this.searchInput = null;
//         this.pagination = null;
//         this.paginationInfo = null;
//         this.filters = [];
//         this.rangeFilters = [];
//         this.itemNotFoundMessage = "Nothing found.";
//         this.deleteRowMessage = "Are you sure you want to delete this row?";
//         this.deleteMultipleRowsMessage = "Are you sure you want to delete these rows?";
//     }

//     get totalPages() {
//         return Math.ceil(this.filteredRows.length / this.rowsPerPage) || 1;
//     }

//     init() {
//         this.setupCheckAll();
//         this.setupCheckboxListeners();
//         this.setupSearch();
//         if (this.headers.length > 0) {
//             this.setupFilters();
//             this.setupSort();
//         }
//         this.setupRowsPerPage();
//         this.setupPagination();
//         this.setupPaginationInfo();
//         this.deleteSelected();
//         this.deleteRow();
//         this.update();
//     }

//     setupCheckAll() {
//         if (this.thead) {
//             this.checkAllCheckBox = this.thead.querySelector(this.parentInstance.checkAllSelector);
//             if (this.checkAllCheckBox) {
//                 this.checkAllCheckBox.addEventListener("click", t => {
//                     let e = this.rows.map(e => e.querySelector('input[type="checkbox"]'));
//                     if (e && e.length > 0) e.forEach(e => e.checked = t.target.checked);
//                 });
//             }
//         }
//     }

//     setupCheckboxListeners() {
//         let t = this.table.querySelectorAll('input[type="checkbox"]');
//         if (this.checkAllCheckBox && t.length > 0) {
//             t.forEach(e => {
//                 e.addEventListener("change", () => {
//                     let e = Array.from(t).some(e => e.checked);
//                     if (this.deleteSelectedSelector && this.filteredRows.length > 0)
//                         this.deleteSelectedSelector.classList.toggle("d-none", !e);
//                 });
//             });
//         }
//     }

//     setupSearch() {
//         this.searchInput = this.table.querySelector(this.parentInstance.searchSelector);
//         if (this.searchInput) {
//             this.searchInput.addEventListener("keyup", e => {
//                 let term = e.target.value.toLowerCase();
//                 this.filteredRows = this._originalRows.filter(row =>
//                     Array.from(row.querySelectorAll("td")).some(td =>
//                         td.textContent.toLowerCase().includes(term)
//                     )
//                 );
//                 this.currentPage = 1;
//                 this.update();
//             });
//         }
//     }

//     setupFilters() {
//         this.filters = Array.from(this.table.querySelectorAll(this.parentInstance.filterSelector));
//         this.filters.forEach(e => {
//             e.addEventListener("change", () => {
//                 this.applyFilters();
//                 this.currentPage = 1;
//                 this.update();
//             });
//         });

//         this.rangeFilters = Array.from(this.table.querySelectorAll(this.parentInstance.rangeFilterSelector));
//         this.rangeFilters.forEach(e => {
//             e.addEventListener("change", () => {
//                 this.applyFilters();
//                 this.currentPage = 1;
//                 this.update();
//             });
//         });
//     }

//     applyFilters() {
//         let textFilter = row => this.filters.every(e => {
//             let val = e.value;
//             if (!val || val === "All") return true;
//             let col = e.dataset.tableFilter;
//             let index = this.headers.findIndex(th => th.dataset.column === col);
//             if (index === -1) return true;
//             let cell = row.children[index];
//             return cell && cell.textContent.trim().toLowerCase() === val.toLowerCase();
//         });

//         let rangeFilter = row => this.rangeFilters.every(filter => {
//             let val = filter.value;
//             if (!val || val === "All") return true;
//             let col = filter.dataset.tableRangeFilter;
//             let index = this.headers.findIndex(th => th.dataset.column === col);
//             if (index === -1) return true;
//             let cell = row.children[index];
//             if (!cell) return true;
//             let cellText = cell.textContent.trim();

//             // Handle numeric and date filters
//             if (!col.toLowerCase().includes("date")) {
//                 let num = parseFloat(cellText.replace(/[^\d.-]/g, ""));
//                 if (isNaN(num)) return false;
//                 if (val.endsWith("+")) return num >= parseFloat(val.slice(0, -1));
//                 let [min, max] = val.split("-").map(x => parseFloat(x.trim()));
//                 return !isNaN(min) && !isNaN(max) && num >= min && num <= max;
//             } else {
//                 let d = new Date(cellText);
//                 if (isNaN(d.getTime())) return false;
//                 let today = new Date();
//                 let start, end;
//                 switch (val) {
//                     case "Today":
//                         start = new Date(today.setHours(0, 0, 0, 0));
//                         end = new Date(start);
//                         end.setDate(start.getDate() + 1);
//                         return d >= start && d < end;
//                     case "Last 7 Days":
//                         start = new Date();
//                         start.setDate(today.getDate() - 7);
//                         return d >= start && d <= today;
//                     case "Last 30 Days":
//                         start = new Date();
//                         start.setDate(today.getDate() - 30);
//                         return d >= start && d <= today;
//                     case "This Year":
//                         start = new Date(today.getFullYear(), 0, 1);
//                         end = new Date(today.getFullYear() + 1, 0, 1);
//                         return d >= start && d < end;
//                     default:
//                         return true;
//                 }
//             }
//         });

//         this.filteredRows = this._originalRows.filter(row => textFilter(row) && rangeFilter(row));
//     }

//     setupRowsPerPage() {
//         let select = this.table.querySelector(this.parentInstance.rowsPerPageSelector);
//         if (select) {
//             let options = Array.from(select.options).map(e => parseInt(e.value));
//             if (!options.includes(this.rowsPerPage)) options.push(this.rowsPerPage);
//             options.sort((a, b) => a - b);
//             select.innerHTML = "";
//             options.forEach(v => {
//                 let opt = document.createElement("option");
//                 opt.value = v.toString();
//                 opt.textContent = v.toString();
//                 select.appendChild(opt);
//             });
//             select.value = this.rowsPerPage;
//             select.addEventListener("change", e => {
//                 e.preventDefault();
//                 this.rowsPerPage = parseInt(e.target.value);
//                 this.update();
//             });
//         }
//     }

//     setupPagination() {
//         this.pagination = this.table.querySelector(this.parentInstance.paginationSelector);
//     }

//     renderTablePage(page) {
//         this.tbody.innerHTML = "";
//         let start = (page - 1) * this.rowsPerPage;
//         let end = start + this.rowsPerPage;
//         let rowsToShow = this.filteredRows.slice(start, end);

//         let noResultRow = this.tbody.querySelector(".no-results");
//         if (noResultRow) noResultRow.remove();

//         if (rowsToShow.length === 0) {
//             let colCount = this.table.querySelectorAll("thead th").length;
//             let tr = document.createElement("tr");
//             tr.className = "no-results";
//             tr.innerHTML = `<td colspan="${colCount}" class="text-center text-muted py-3">${this.itemNotFoundMessage}</td>`;
//             this.tbody.appendChild(tr);
//         } else {
//             rowsToShow.forEach(row => this.tbody.appendChild(row));
//         }
//     }

//     renderPagination() {
//         let ul = document.createElement("ul");
//         ul.className = "pagination pagination-sm pagination-boxed mb-0 justify-content-center";
//         this.pagination.innerHTML = "";
//         let totalPages = this.totalPages;

//         // Prev button
//         let prev = document.createElement("li");
//         prev.className = "page-item " + (this.currentPage === 1 ? "disabled" : "");
//         prev.innerHTML = '<a href="#" class="page-link"><i class="ti ti-chevron-left"></i></a>';
//         prev.addEventListener("click", e => {
//             e.preventDefault();
//             if (this.currentPage > 1) {
//                 this.currentPage--;
//                 this.update();
//             }
//         });
//         ul.appendChild(prev);

//         // Page numbers
//         for (let i = 1; i <= totalPages; i++) {
//             let li = document.createElement("li");
//             li.className = "page-item " + (this.currentPage === i ? "active" : "");
//             li.innerHTML = `<a href="#" class="page-link">${i}</a>`;
//             li.addEventListener("click", e => {
//                 e.preventDefault();
//                 this.currentPage = i;
//                 this.update();
//             });
//             ul.appendChild(li);
//         }

//         // Next button
//         let next = document.createElement("li");
//         next.className = "page-item " + (this.currentPage === totalPages ? "disabled" : "");
//         next.innerHTML = '<a href="#" class="page-link"><i class="ti ti-chevron-right"></i></a>';
//         next.addEventListener("click", e => {
//             e.preventDefault();
//             if (this.currentPage < totalPages) {
//                 this.currentPage++;
//                 this.update();
//             }
//         });
//         ul.appendChild(next);

//         this.pagination.appendChild(ul);
//         this.setupPaginationInfo();
//     }

//     setupPaginationInfo() {
//         this.paginationInfo = this.table.querySelector(this.parentInstance.paginationInfoSelector);
//         if (this.paginationInfo) {
//             this.paginationInfo.className = "text-muted";
//             let label = this.paginationInfo.getAttribute(this.parentInstance.paginationInfoAttribute);
//             let start = (this.currentPage - 1) * this.rowsPerPage + 1;
//             let end = Math.min(this.currentPage * this.rowsPerPage, this.filteredRows.length);
//             this.paginationInfo.innerHTML = `Showing <span class="fw-semibold">${start}</span> to <span class="fw-semibold">${end}</span> of <span class="fw-semibold">${this.filteredRows.length}</span> ${label && label !== "" ? label : "entries"}`;
//         }
//     }

//     // ✅ Fixed update method
//     update() {
//         // Do not overwrite rows each time — use original stable data
//         if (!this._originalRows || this._originalRows.length === 0) {
//             this._originalRows = Array.from(this.tbody.querySelectorAll("tr"));
//         }

//         // Reapply filters/search logic
//         this.filteredRows = [...this._originalRows];

//         if (this.searchInput && this.searchInput.value) {
//             let term = this.searchInput.value.toLowerCase();
//             this.filteredRows = this.filteredRows.filter(row =>
//                 Array.from(row.querySelectorAll("td")).some(td =>
//                     td.textContent.toLowerCase().includes(term)
//                 )
//             );
//         }

//         if (this.filters.length > 0) this.applyFilters();

//         this.renderTablePage(this.currentPage);

//         if (this.pagination) {
//             let hasRows = this.filteredRows.length > 0;
//             this.pagination.style.display = hasRows ? "block" : "none";
//             if (this.paginationInfo)
//                 this.paginationInfo.style.display = hasRows ? "block" : "none";
//             if (hasRows) this.renderPagination();
//         }
//     }

//     // Sorting, deletion & alert methods remain unchanged below
//     // (retain your existing setupSort, deleteSelected, deleteRow, alert)
//     // ...
//     setupSort() {
//         this.table.querySelectorAll(this.parentInstance.sortSelector).forEach(t => {
//             t.style.cursor = "pointer";
//             let l = t.querySelector("i");
//             l || ((l = document.createElement("i")).className = "ti ti-arrows-sort fs-xs ms-1", t.appendChild(l)), t.addEventListener("click", e => {
//                 e.preventDefault();
//                 let r = Array.from(t.parentElement.children).indexOf(t); if (-1 !== r) {
//                     let a = t.getAttribute(this.parentInstance.sortAttribute);
//                     let s = "asc" === t.dataset.direction ? "desc" : "asc";
//                     function i(t, a, s) {
//                         t = t.children[a]; if (!t) return "";
//                         let e = ""; s = (e = (e = s ? (a = t.querySelector(`[data-sort="${s}"]`)) ? a.textContent.trim() : "" : (Array.from(t.childNodes).find(e => e.nodeType === Node.TEXT_NODE && e.textContent.trim()) || t).textContent.trim()).replace(/\s+/g, " ")).match(/^\(([\d,.\s]+)\)$/);
//                         if (s) return a = parseFloat(s[1].replace(/,/g, "")), isNaN(a) ? e.toLowerCase() : -a; if (/^-?[\d,.]+%$/.test(e))
//                             return t = parseFloat(e.replace("%", "")), isNaN(t) ? 0 : t / 100; s = e.match(/^-?[\$€₹]?\s*([\d,.]+)\s*([KMB])?$/i);
//                         if (s) {
//                             let e = parseFloat(s[1].replace(/,/g, ""));
//                             a = s[2]?.toUpperCase(), t = { K: 1e3, M: 1e6, B: 1e9 };
//                             if (!isNaN(e)) return a && t[a] && (e *= t[a]), e
//                         }
//                         s = e.match(/^(\d+)(st|nd|rd|th)$/i);
//                         return s ? parseInt(s[1], 10) : /^-?\d+(\.\d+)?$/.test(e) ? (t = parseFloat(e), isNaN(t) ? e.toLowerCase() : t) : (a = new Date(e), isNaN(a.getTime()) ? e.toLowerCase() : a.getTime())
//                     } "asc" == (t.dataset.direction = s) ? l.className = "ti ti-arrow-up fs-xs ms-1" : l.className = "ti ti-arrow-down fs-xs ms-1", this.filteredRows.sort((e, t) => {
//                         e = i(e, r, a), t = i(t, r, a);
//                         return "number" == typeof e && "number" == typeof t ? "asc" == s ? e - t : t - e : "string" == typeof e && "string" == typeof t ? "asc" == s ? e.localeCompare(t) : t.localeCompare(e) : 0
//                     }),
//                         this.currentPage = 1, this.update()
//                 }
//             })
//         })
//     }
//     deleteSelected() {
//         this.deleteSelectedSelector = this.table.querySelector(this.parentInstance.deleteSelectedSelector),
//             this.deleteSelectedSelector && this.deleteSelectedSelector.addEventListener("click", e => {
//                 e.preventDefault();
//                 let s = this.rows.filter(e => e.querySelector('input[type="checkbox"]').checked); if (0 < s.length) {
//                     let { modal: t, confirmButton: e } = this.alert(1 < s.length ? this.deleteMultipleRowsMessage : this.deleteRowMessage),
//                         a = this.rows; t.show(), e.addEventListener("click", () => { s.forEach(e => e.remove()); var e = a.filter(e => !s.includes(e)); this.rows = [...e], this.filteredRows = [...e], this.currentPage > this.totalPages && (this.currentPage = this.totalPages), this.update(), t.hide(), this.deleteSelectedSelector.classList.add("d-none"), this.checkAllCheckBox.checked = !1 })
//                 }
//             })
//     }
//     deleteRow() {
//         var e = this.table.querySelectorAll(this.parentInstance.deleteRowSelector);
//         e && e.forEach(r => {
//             r.addEventListener("click", e => {
//                 e.preventDefault();
//                 let { modal: a, confirmButton: t } = this.alert(), s = this.rows; a.show(), t.addEventListener("click", () => { let t = r.closest("tr"); t.remove(); var e = s.filter(e => e !== t); this.rows = [...e], this.filteredRows = [...e], this.currentPage > this.totalPages && (this.currentPage = this.totalPages), this.update(), a.hide() })
//             })
//         })
//     }
//     alert(e) {
//         e = `
//                 <div id="confirm-delete-modal" class="modal fade" tabindex="-1" aria-hidden="true">
//                     <div class="modal-dialog modal-dialog-centered">
//                         <div class="modal-content">
//                             <div class="modal-header">
//                                 <h4 class="modal-title">Confirm Deletion</h4>
//                                 <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
//                             </div>
//                             <div class="modal-body">   
//                                 <p class="mb-0">${e ?? this.deleteRowMessage}</p>
//                             </div>
//                             <div class="modal-footer">
//                                 <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
//                                 <button type="button" class="btn btn-danger" id="confirm-delete">Delete</button>
//                             </div>
//                         </div>
//                     </div>
//                 </div>`, document.body.insertAdjacentHTML("beforeend", e), e = document.getElementById("confirm-delete-modal"); return { modal: new bootstrap.Modal(e), confirmButton: e.querySelector("#confirm-delete") }
//     }
// }


// class CustomTable {
//     constructor({
//         tableSelector = "[data-table]",
//         checkAllSelector = "[data-table-select-all]",
//         searchSelector = "[data-table-search]",
//         filterSelector = "select[data-table-filter], input[data-table-filter]",
//         rangeFilterSelector = "select[data-table-range-filter], input[data-table-range-filter]",
//         rowsPerPageSelector = "[data-table-set-rows-per-page]",
//         rowsPerPageAttribute = "data-table-rows-per-page",
//         paginationSelector = "[data-table-pagination]",
//         sortSelector = "[data-table-sort]",
//         sortAttribute = "data-table-sort",
//         paginationInfoSelector = "[data-table-pagination-info]",
//         paginationInfoAttribute = "data-table-pagination-info",
//         deleteSelectedSelector = "[data-table-delete-selected]",
//         deleteRowSelector = "[data-table-delete-row]",
//         rowsPerPage = 10,
//         currentPage = 1
//     } = {}) {
//         this.tableSelector = tableSelector;
//         this.checkAllSelector = checkAllSelector;
//         this.searchSelector = searchSelector;
//         this.filterSelector = filterSelector;
//         this.rangeFilterSelector = rangeFilterSelector;
//         this.rowsPerPageSelector = rowsPerPageSelector;
//         this.rowsPerPageAttribute = rowsPerPageAttribute;
//         this.paginationSelector = paginationSelector;
//         this.sortSelector = sortSelector;
//         this.sortAttribute = sortAttribute;
//         this.paginationInfoSelector = paginationInfoSelector;
//         this.paginationInfoAttribute = paginationInfoAttribute;
//         this.deleteSelectedSelector = deleteSelectedSelector;
//         this.deleteRowSelector = deleteRowSelector;
//         this.rowsPerPage = rowsPerPage;
//         this.currentPage = currentPage;
//         this.tables = [];
//         this.init();
//     }

//     init() {
//         document.querySelectorAll(this.tableSelector).forEach(e => {
//             let tableInstance = new Table(e, this);
//             this.tables.push(tableInstance);
//             tableInstance.init();
//         });
//     }
// }

// document.addEventListener("DOMContentLoaded", () => {
//     new CustomTable();
// });

if (typeof Table === "undefined") {
    class Table {
        constructor(e, t) {
            this.table = e;
            this.parentInstance = t;
            this.thead = e.querySelector("thead");
            this.tbody = e.querySelector("tbody");
            this.headers = [];
            if (this.thead) {
                this.headers = Array.from(this.thead.querySelectorAll("th"));
            }
            this.rows = Array.from(this.tbody.querySelectorAll("tr"));
            this.filteredRows = [...this.rows];
            this._originalRows = [...this.rows]; // ✅ Keep a stable copy for pagination & filters
            this.rowsPerPage = parseInt(e.getAttribute(this.parentInstance.rowsPerPageAttribute) ?? this.parentInstance.rowsPerPage);
            this.currentPage = this.parentInstance.currentPage;
            this.checkAllCheckBox = null;
            this.searchInput = null;
            this.pagination = null;
            this.paginationInfo = null;
            this.filters = [];
            this.rangeFilters = [];
            this.itemNotFoundMessage = "Nothing found.";
            this.deleteRowMessage = "Are you sure you want to delete this row?";
            this.deleteMultipleRowsMessage = "Are you sure you want to delete these rows?";
        }

        get totalPages() {
            return Math.ceil(this.filteredRows.length / this.rowsPerPage) || 1;
        }

        init() {
            this.setupCheckAll();
            this.setupCheckboxListeners();
            this.setupSearch();
            if (this.headers.length > 0) {
                this.setupFilters();
                this.setupSort();
            }
            this.setupRowsPerPage();
            this.setupPagination();
            this.setupPaginationInfo();
            this.deleteSelected();
            this.deleteRow();
            this.update();
        }

        setupCheckAll() {
            if (this.thead) {
                this.checkAllCheckBox = this.thead.querySelector(this.parentInstance.checkAllSelector);
                if (this.checkAllCheckBox) {
                    this.checkAllCheckBox.addEventListener("click", t => {
                        let e = this.rows.map(e => e.querySelector('input[type="checkbox"]'));
                        if (e && e.length > 0) e.forEach(e => e.checked = t.target.checked);
                    });
                }
            }
        }

        setupCheckboxListeners() {
            let t = this.table.querySelectorAll('input[type="checkbox"]');
            if (this.checkAllCheckBox && t.length > 0) {
                t.forEach(e => {
                    e.addEventListener("change", () => {
                        let e = Array.from(t).some(e => e.checked);
                        if (this.deleteSelectedSelector && this.filteredRows.length > 0)
                            this.deleteSelectedSelector.classList.toggle("d-none", !e);
                    });
                });
            }
        }

        setupSearch() {
            this.searchInput = this.table.querySelector(this.parentInstance.searchSelector);
            if (this.searchInput) {
                this.searchInput.addEventListener("keyup", e => {
                    let term = e.target.value.toLowerCase();
                    this.filteredRows = this._originalRows.filter(row =>
                        Array.from(row.querySelectorAll("td")).some(td =>
                            td.textContent.toLowerCase().includes(term)
                        )
                    );
                    this.currentPage = 1;
                    this.update();
                });
            }
        }

        setupFilters() {
            this.filters = Array.from(this.table.querySelectorAll(this.parentInstance.filterSelector));
            this.filters.forEach(e => {
                e.addEventListener("change", () => {
                    this.applyFilters();
                    this.currentPage = 1;
                    this.update();
                });
            });

            this.rangeFilters = Array.from(this.table.querySelectorAll(this.parentInstance.rangeFilterSelector));
            this.rangeFilters.forEach(e => {
                e.addEventListener("change", () => {
                    this.applyFilters();
                    this.currentPage = 1;
                    this.update();
                });
            });
        }

        applyFilters() {
            let textFilter = row => this.filters.every(e => {
                let val = e.value;
                if (!val || val === "All") return true;
                let col = e.dataset.tableFilter;
                let index = this.headers.findIndex(th => th.dataset.column === col);
                if (index === -1) return true;
                let cell = row.children[index];
                return cell && cell.textContent.trim().toLowerCase() === val.toLowerCase();
            });

            let rangeFilter = row => this.rangeFilters.every(filter => {
                let val = filter.value;
                if (!val || val === "All") return true;
                let col = filter.dataset.tableRangeFilter;
                let index = this.headers.findIndex(th => th.dataset.column === col);
                if (index === -1) return true;
                let cell = row.children[index];
                if (!cell) return true;
                let cellText = cell.textContent.trim();

                // Handle numeric and date filters
                if (!col.toLowerCase().includes("date")) {
                    let num = parseFloat(cellText.replace(/[^\d.-]/g, ""));
                    if (isNaN(num)) return false;
                    if (val.endsWith("+")) return num >= parseFloat(val.slice(0, -1));
                    let [min, max] = val.split("-").map(x => parseFloat(x.trim()));
                    return !isNaN(min) && !isNaN(max) && num >= min && num <= max;
                } else {
                    let d = new Date(cellText);
                    if (isNaN(d.getTime())) return false;
                    let today = new Date();
                    let start, end;
                    switch (val) {
                        case "Today":
                            start = new Date(today.setHours(0, 0, 0, 0));
                            end = new Date(start);
                            end.setDate(start.getDate() + 1);
                            return d >= start && d < end;
                        case "Last 7 Days":
                            start = new Date();
                            start.setDate(today.getDate() - 7);
                            return d >= start && d <= today;
                        case "Last 30 Days":
                            start = new Date();
                            start.setDate(today.getDate() - 30);
                            return d >= start && d <= today;
                        case "This Year":
                            start = new Date(today.getFullYear(), 0, 1);
                            end = new Date(today.getFullYear() + 1, 0, 1);
                            return d >= start && d < end;
                        default:
                            return true;
                    }
                }
            });

            this.filteredRows = this._originalRows.filter(row => textFilter(row) && rangeFilter(row));
        }

        setupRowsPerPage() {
            let select = this.table.querySelector(this.parentInstance.rowsPerPageSelector);
            if (select) {
                let options = Array.from(select.options).map(e => parseInt(e.value));
                if (!options.includes(this.rowsPerPage)) options.push(this.rowsPerPage);
                options.sort((a, b) => a - b);
                select.innerHTML = "";
                options.forEach(v => {
                    let opt = document.createElement("option");
                    opt.value = v.toString();
                    opt.textContent = v.toString();
                    select.appendChild(opt);
                });
                select.value = this.rowsPerPage;
                select.addEventListener("change", e => {
                    e.preventDefault();
                    this.rowsPerPage = parseInt(e.target.value);
                    this.update();
                });
            }
        }

        setupPagination() {
            this.pagination = this.table.querySelector(this.parentInstance.paginationSelector);
        }

        renderTablePage(page) {
            this.tbody.innerHTML = "";
            let start = (page - 1) * this.rowsPerPage;
            let end = start + this.rowsPerPage;
            let rowsToShow = this.filteredRows.slice(start, end);

            let noResultRow = this.tbody.querySelector(".no-results");
            if (noResultRow) noResultRow.remove();

            if (rowsToShow.length === 0) {
                let colCount = this.table.querySelectorAll("thead th").length;
                let tr = document.createElement("tr");
                tr.className = "no-results";
                tr.innerHTML = `<td colspan="${colCount}" class="text-center text-muted py-3">${this.itemNotFoundMessage}</td>`;
                this.tbody.appendChild(tr);
            } else {
                rowsToShow.forEach(row => this.tbody.appendChild(row));
            }
        }

        renderPagination() {
            let ul = document.createElement("ul");
            ul.className = "pagination pagination-sm pagination-boxed mb-0 justify-content-center";
            this.pagination.innerHTML = "";
            let totalPages = this.totalPages;

            // Prev button
            let prev = document.createElement("li");
            prev.className = "page-item " + (this.currentPage === 1 ? "disabled" : "");
            prev.innerHTML = '<a href="#" class="page-link"><i class="ti ti-chevron-left"></i></a>';
            prev.addEventListener("click", e => {
                e.preventDefault();
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.update();
                }
            });
            ul.appendChild(prev);

            // Page numbers
            for (let i = 1; i <= totalPages; i++) {
                let li = document.createElement("li");
                li.className = "page-item " + (this.currentPage === i ? "active" : "");
                li.innerHTML = `<a href="#" class="page-link">${i}</a>`;
                li.addEventListener("click", e => {
                    e.preventDefault();
                    this.currentPage = i;
                    this.update();
                });
                ul.appendChild(li);
            }

            // Next button
            let next = document.createElement("li");
            next.className = "page-item " + (this.currentPage === totalPages ? "disabled" : "");
            next.innerHTML = '<a href="#" class="page-link"><i class="ti ti-chevron-right"></i></a>';
            next.addEventListener("click", e => {
                e.preventDefault();
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.update();
                }
            });
            ul.appendChild(next);

            this.pagination.appendChild(ul);
            this.setupPaginationInfo();
        }

        setupPaginationInfo() {
            this.paginationInfo = this.table.querySelector(this.parentInstance.paginationInfoSelector);
            if (this.paginationInfo) {
                this.paginationInfo.className = "text-muted";
                let label = this.paginationInfo.getAttribute(this.parentInstance.paginationInfoAttribute);
                let start = (this.currentPage - 1) * this.rowsPerPage + 1;
                let end = Math.min(this.currentPage * this.rowsPerPage, this.filteredRows.length);
                this.paginationInfo.innerHTML = `Showing <span class="fw-semibold">${start}</span> to <span class="fw-semibold">${end}</span> of <span class="fw-semibold">${this.filteredRows.length}</span> ${label && label !== "" ? label : "entries"}`;
            }
        }

        // ✅ Fixed update method
        update() {
            // Do not overwrite rows each time — use original stable data
            if (!this._originalRows || this._originalRows.length === 0) {
                this._originalRows = Array.from(this.tbody.querySelectorAll("tr"));
            }

            // Reapply filters/search logic
            this.filteredRows = [...this._originalRows];

            if (this.searchInput && this.searchInput.value) {
                let term = this.searchInput.value.toLowerCase();
                this.filteredRows = this.filteredRows.filter(row =>
                    Array.from(row.querySelectorAll("td")).some(td =>
                        td.textContent.toLowerCase().includes(term)
                    )
                );
            }

            if (this.filters.length > 0) this.applyFilters();

            this.renderTablePage(this.currentPage);

            if (this.pagination) {
                let hasRows = this.filteredRows.length > 0;
                this.pagination.style.display = hasRows ? "block" : "none";
                if (this.paginationInfo)
                    this.paginationInfo.style.display = hasRows ? "block" : "none";
                if (hasRows) this.renderPagination();
            }
        }

        // Sorting, deletion & alert methods remain unchanged below
        // (retain your existing setupSort, deleteSelected, deleteRow, alert)
        // ...
        setupSort() {
            this.table.querySelectorAll(this.parentInstance.sortSelector).forEach(t => {
                t.style.cursor = "pointer";
                let l = t.querySelector("i");
                l || ((l = document.createElement("i")).className = "ti ti-arrows-sort fs-xs ms-1", t.appendChild(l)), t.addEventListener("click", e => {
                    e.preventDefault();
                    let r = Array.from(t.parentElement.children).indexOf(t); if (-1 !== r) {
                        let a = t.getAttribute(this.parentInstance.sortAttribute);
                        let s = "asc" === t.dataset.direction ? "desc" : "asc";
                        function i(t, a, s) {
                            t = t.children[a]; if (!t) return "";
                            let e = ""; s = (e = (e = s ? (a = t.querySelector(`[data-sort="${s}"]`)) ? a.textContent.trim() : "" : (Array.from(t.childNodes).find(e => e.nodeType === Node.TEXT_NODE && e.textContent.trim()) || t).textContent.trim()).replace(/\s+/g, " ")).match(/^\(([\d,.\s]+)\)$/);
                            if (s) return a = parseFloat(s[1].replace(/,/g, "")), isNaN(a) ? e.toLowerCase() : -a; if (/^-?[\d,.]+%$/.test(e))
                                return t = parseFloat(e.replace("%", "")), isNaN(t) ? 0 : t / 100; s = e.match(/^-?[\$€₹]?\s*([\d,.]+)\s*([KMB])?$/i);
                            if (s) {
                                let e = parseFloat(s[1].replace(/,/g, ""));
                                a = s[2]?.toUpperCase(), t = { K: 1e3, M: 1e6, B: 1e9 };
                                if (!isNaN(e)) return a && t[a] && (e *= t[a]), e
                            }
                            s = e.match(/^(\d+)(st|nd|rd|th)$/i);
                            return s ? parseInt(s[1], 10) : /^-?\d+(\.\d+)?$/.test(e) ? (t = parseFloat(e), isNaN(t) ? e.toLowerCase() : t) : (a = new Date(e), isNaN(a.getTime()) ? e.toLowerCase() : a.getTime())
                        } "asc" == (t.dataset.direction = s) ? l.className = "ti ti-arrow-up fs-xs ms-1" : l.className = "ti ti-arrow-down fs-xs ms-1", this.filteredRows.sort((e, t) => {
                            e = i(e, r, a), t = i(t, r, a);
                            return "number" == typeof e && "number" == typeof t ? "asc" == s ? e - t : t - e : "string" == typeof e && "string" == typeof t ? "asc" == s ? e.localeCompare(t) : t.localeCompare(e) : 0
                        }),
                            this.currentPage = 1, this.update()
                    }
                })
            })
        }
        deleteSelected() {
            this.deleteSelectedSelector = this.table.querySelector(this.parentInstance.deleteSelectedSelector),
                this.deleteSelectedSelector && this.deleteSelectedSelector.addEventListener("click", e => {
                    e.preventDefault();
                    let s = this.rows.filter(e => e.querySelector('input[type="checkbox"]').checked); if (0 < s.length) {
                        let { modal: t, confirmButton: e } = this.alert(1 < s.length ? this.deleteMultipleRowsMessage : this.deleteRowMessage),
                            a = this.rows; t.show(), e.addEventListener("click", () => { s.forEach(e => e.remove()); var e = a.filter(e => !s.includes(e)); this.rows = [...e], this.filteredRows = [...e], this.currentPage > this.totalPages && (this.currentPage = this.totalPages), this.update(), t.hide(), this.deleteSelectedSelector.classList.add("d-none"), this.checkAllCheckBox.checked = !1 })
                    }
                })
        }
        deleteRow() {
            var e = this.table.querySelectorAll(this.parentInstance.deleteRowSelector);
            e && e.forEach(r => {
                r.addEventListener("click", e => {
                    e.preventDefault();
                    let { modal: a, confirmButton: t } = this.alert(), s = this.rows; a.show(), t.addEventListener("click", () => { let t = r.closest("tr"); t.remove(); var e = s.filter(e => e !== t); this.rows = [...e], this.filteredRows = [...e], this.currentPage > this.totalPages && (this.currentPage = this.totalPages), this.update(), a.hide() })
                })
            })
        }
        alert(e) {
            e = `
                <div id="confirm-delete-modal" class="modal fade" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h4 class="modal-title">Confirm Deletion</h4>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">   
                                <p class="mb-0">${e ?? this.deleteRowMessage}</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-danger" id="confirm-delete">Delete</button>
                            </div>
                        </div>
                    </div>
                </div>`, document.body.insertAdjacentHTML("beforeend", e), e = document.getElementById("confirm-delete-modal"); return { modal: new bootstrap.Modal(e), confirmButton: e.querySelector("#confirm-delete") }
        }
    }
    window.Table = Table;
}

if (typeof CustomTable === "undefined") {
    class CustomTable {
        constructor({
            tableSelector = "[data-table]",
            checkAllSelector = "[data-table-select-all]",
            searchSelector = "[data-table-search]",
            filterSelector = "select[data-table-filter], input[data-table-filter]",
            rangeFilterSelector = "select[data-table-range-filter], input[data-table-range-filter]",
            rowsPerPageSelector = "[data-table-set-rows-per-page]",
            rowsPerPageAttribute = "data-table-rows-per-page",
            paginationSelector = "[data-table-pagination]",
            sortSelector = "[data-table-sort]",
            sortAttribute = "data-table-sort",
            paginationInfoSelector = "[data-table-pagination-info]",
            paginationInfoAttribute = "data-table-pagination-info",
            deleteSelectedSelector = "[data-table-delete-selected]",
            deleteRowSelector = "[data-table-delete-row]",
            rowsPerPage = 10,
            currentPage = 1
        } = {}) {
            this.tableSelector = tableSelector;
            this.checkAllSelector = checkAllSelector;
            this.searchSelector = searchSelector;
            this.filterSelector = filterSelector;
            this.rangeFilterSelector = rangeFilterSelector;
            this.rowsPerPageSelector = rowsPerPageSelector;
            this.rowsPerPageAttribute = rowsPerPageAttribute;
            this.paginationSelector = paginationSelector;
            this.sortSelector = sortSelector;
            this.sortAttribute = sortAttribute;
            this.paginationInfoSelector = paginationInfoSelector;
            this.paginationInfoAttribute = paginationInfoAttribute;
            this.deleteSelectedSelector = deleteSelectedSelector;
            this.deleteRowSelector = deleteRowSelector;
            this.rowsPerPage = rowsPerPage;
            this.currentPage = currentPage;
            this.tables = [];
            this.init();
        }

        init() {
            document.querySelectorAll(this.tableSelector).forEach(e => {
                let tableInstance = new Table(e, this);
                this.tables.push(tableInstance);
                tableInstance.init();
            });
        }
    }
    window.CustomTable = CustomTable;
}

document.addEventListener("DOMContentLoaded", () => {
    new CustomTable();
});
