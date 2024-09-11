// frappe.pages['target-allocation'].on_page_load = function(wrapper) {
// 	new MyPage(wrapper);
// }

// //Page Content
// MyPage= Class.extend({
// 	init : function(wrapper){
// 		this.page = frappe.ui.make_app_page({
// 			parent: wrapper,
// 			title: 'Target Allocation',
// 			single_column: true
// 		});
// 	}

// })

// frappe.pages['target-allocation'].on_page_load = function(wrapper) {
//     var page = frappe.ui.make_app_page({
//         parent: wrapper,
//         title: 'Target Allocation',
//         single_column: true
//     });

//     $(frappe.render_template("target_sheet_template")).appendTo(page.body);

//     // Function to add a new row to the table
//     function addRow() {
//         var tableBody = $("#target-sheet-table-body");
//         var newRow = `<tr>
//             <td><input type="text" class="form-control target-name" placeholder="Sales Person" data-fieldname="sales_person" data-doctype="Sales Person"></td>
//             <td contenteditable="true"></td>
//             <td contenteditable="true"></td>
//             <td contenteditable="true"></td>
//             <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
//         </tr>`;
//         tableBody.append(newRow);

//         // Initialize link field for the new row
//         // initializeLinkField(tableBody.find('input.target-name').last());
//     }


//     // Add initial row
//     addRow();

//     // Add a new row when the button is clicked
//     $("#add-row-btn").click(function() {
//         addRow();
//     });

//     // Remove a row when the remove button is clicked
//     $(document).on('click', '.remove-row', function() {
//         $(this).closest('tr').remove();
//     });

// 	// Function to initialize link field
//     // function initializeLinkField(linkField) {
// 	// 	$(linkField).autocomplete({
//     //         source: function(request, response) {
//     //             frappe.call({
//     //                 method: "frappe.client.get_list",
//     //                 args: {
//     //                     doctype: targetField.attr('data-doctype'),
//     //                     filters: {
//     //                         "name": ["like", "%" + request.term + "%"]
//     //                     },
//     //                     limit: 20
//     //                 },
//     //                 callback: function(r) {
//     //                     var results = $.map(r.message, function(item) {
//     //                         return {
//     //                             label: item.name,
//     //                             value: item.name
//     //                         };
//     //                     });
//     //                     response(results);
//     //                 }
//     //             });
//     //         },
//     //         minLength: 1
//     //     });
//     // }
// };



frappe.pages['target-allocation'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Targets',
        single_column: true
    });

    // Create main table
    $(page.body).append(`
        <div class="container">
            <h3>Target Details</h3>
            <table class="table" id="main-table">
                <thead>
                    <tr>
                        <th>Sales Person</th>
                        <th>Fiscal Year</th>
                        <th>Topline Amount</th>
                        <th>Bottomline Amount</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="main-table-body">
                    <!-- Rows will be dynamically added here -->
                </tbody>
            </table>
            <button class="btn btn-primary" onclick="addMainRow()">Add Row</button>
        </div>
        
        <!-- Modal for secondary table -->
        <div class="modal fade" id="details-modal" tabindex="-1" role="dialog">
            <div class="modal-dialog custom-modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Target Details</h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <table class="table" id="details-table">
                            <thead>
                                <tr>
                                    <th>Category Type</th>
                                    <th>Category</th>
                                    <th>Fiscal Year</th>
                                    <th>Topline Amount</th>
                                    <th>Bottomline Amount</th>
                                    <th>Target Distribution</th>
                                </tr>
                            </thead>
                            <tbody id="details-table-body">
                                <!-- Rows will be dynamically added here -->
                            </tbody>
                        </table>
                        <button class="btn btn-primary" onclick="addDetailsRow()">Add Row</button>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" onclick="saveDetails()">Set</button>
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `);

    let currentMainRowIndex;

    function fetchOptions() {
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Person',
                fields: ['name'],
                limit: 1000
            },
            callback: function(response) {
                if (response.message) {
                    var salespersons = response.message;
                    fetchFiscalYears(salespersons);
                } else {
                    frappe.msgprint('Failed to fetch salespersons.');
                }
            }
        });
    }

    function fetchFiscalYears(salespersons) {
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Fiscal Year',
                fields: ['name'],
                limit: 1000
            },
            callback: function(response) {
                if (response.message) {
                    fetchCategoryTypeOptions(salespersons, response.message);
                } else {
                    frappe.msgprint('Failed to fetch fiscal years.');
                }
            }
        });
    }

    function fetchCategoryTypeOptions(salespersons, fiscalYears) {
        const doctypes = ['Brand', 'Item Group'];

        const promises = doctypes.map(doctype => {
            return frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: doctype,
                    fields: ['name'],
                    limit: 1000
                }
            }).then(response => {
                if (response.message) {
                    return { doctype, data: response.message };
                } else {
                    frappe.msgprint(`Failed to fetch data for ${doctype}.`);
                    return { doctype, data: [] };
                }
            });
        });

        Promise.all(promises).then(results => {
            const categoryTypeValues = {};
            results.forEach(result => {
                categoryTypeValues[result.doctype] = result.data;
            });

            renderForm(salespersons, fiscalYears, categoryTypeValues);
        }).catch(error => {
            console.error('Error fetching category type options:', error);
            frappe.msgprint('Failed to fetch category type options.');
        });
    }

    function renderForm(salespersons, fiscalYears, categoryTypeValues) {
        window.addMainRow = function() {
            const mainTableBody = document.getElementById('main-table-body');
            const row = document.createElement('tr');

            const salesPersonSelect = document.createElement('select');
            salesPersonSelect.classList.add('form-control');
            salesPersonSelect.innerHTML = '<option value=""> </option>';
            salespersons.forEach(person => {
                const option = document.createElement('option');
                option.value = person.name;
                option.text = person.name;
                salesPersonSelect.appendChild(option);
            });

            const fiscalYearSelect = document.createElement('select');
            fiscalYearSelect.classList.add('form-control');
            fiscalYearSelect.innerHTML = '<option value=""> </option>';
            fiscalYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year.name;
                option.text = year.name;
                fiscalYearSelect.appendChild(option);
            });

            row.innerHTML = `
                <td></td>
                <td></td>
                <td><input type="text" class="form-control"></td>
                <td><input type="text" class="form-control"></td>
                <td><button class="btn btn-primary" onclick="viewDetails(this)">View Details</button></td>
            `;

            row.cells[0].appendChild(salesPersonSelect);
            row.cells[1].appendChild(fiscalYearSelect);

            mainTableBody.appendChild(row);
        }

        window.viewDetails = function(button) {
            const rowIndex = button.parentNode.parentNode.rowIndex - 1;
            currentMainRowIndex = rowIndex;

            const mainTableBody = document.getElementById('main-table-body');
            const mainRow = mainTableBody.rows[currentMainRowIndex];
            const details = mainRow.details || [];

            const detailsTableBody = document.getElementById('details-table-body');
            detailsTableBody.innerHTML = '';

            details.forEach(detail => {
                const row = document.createElement('tr');

                const categoryTypeOptions = `
                    <option value=""> </option>
                    <option value="Brand">Brand</option>
                    <option value="Item Group">Item Group</option>
                `;

                const fiscalYearOptions = '<option value=""> </option>' + fiscalYears.map(year => `<option value="${year.name}">${year.name}</option>`).join('');
                const targetDistributionOptions = ['Monthly Distribution'].map(option => `<option value="${option}">${option}</option>`).join('');

                row.innerHTML = `
                    <td><select class="form-control">${categoryTypeOptions}</select></td>
                    <td><select class="form-control"></select></td>
                    <td><select class="form-control">${fiscalYearOptions}</select></td>
                    <td><input type="text" class="form-control"></td>
                    <td><input type="text" class="form-control"></td>
                    <td><select class="form-control">${targetDistributionOptions}</select></td>
                `;

                const categoryTypeSelect = row.querySelector('select');
                const categorySelect = row.querySelectorAll('select')[1];

                categoryTypeSelect.value = detail.category_type;
                const categoryOptions = categoryTypeValues[detail.category_type] || [];
                categorySelect.innerHTML = '<option value=""> </option>' + categoryOptions.map(option => `<option value="${option.name}">${option.name}</option>`).join('');
                categorySelect.value = detail.category;

                row.querySelectorAll('select')[2].value = detail.fiscal_year;
                row.querySelector('input').value = detail.topline_amount;
                row.querySelector('input').value = detail.bottomline_amount;
                row.querySelectorAll('select')[3].value = detail.target_distribution;

                categoryTypeSelect.addEventListener('change', function() {
                    const categoryType = this.value;
                    const categoryOptions = categoryTypeValues[categoryType] || [];
                    categorySelect.innerHTML = '<option value=""> </option>' + categoryOptions.map(option => `<option value="${option.name}">${option.name}</option>`).join('');
                });

                detailsTableBody.appendChild(row);
            });

            $('#details-modal').modal('show');
        }

        window.addDetailsRow = function() {
            const detailsTableBody = document.getElementById('details-table-body');
            const row = document.createElement('tr');

            const categoryTypeOptions = `
                <option value=""> </option>
                <option value="Brand">Brand</option>
                <option value="Item Group">Item Group</option>
            `;

            const fiscalYearOptions = '<option value=""> </option>' + fiscalYears.map(year => `<option value="${year.name}">${year.name}</option>`).join('');

            const targetDistributionOptions = ['','Monthly Distribution'].map(option => `<option value="${option}">${option}</option>`).join('');

            row.innerHTML = `
                <td><select class="form-control">${categoryTypeOptions}</select></td>
                <td><select class="form-control"><option value=""> </option></select></td>
                <td><select class="form-control">${fiscalYearOptions}</select></td>
                <td><input type="text" class="form-control"></td>
                <td><input type="text" class="form-control"></td>
                <td><select class="form-control">${targetDistributionOptions}</select></td>
            `;

            const categoryTypeSelect = row.querySelector('select');
            const categorySelect = row.querySelectorAll('select')[1];

            categoryTypeSelect.addEventListener('change', function() {
                const categoryType = this.value;
                const categoryOptions = categoryTypeValues[categoryType] || [];
                categorySelect.innerHTML = '<option value=""> </option>' + categoryOptions.map(option => `<option value="${option.name}">${option.name}</option>`).join('');
            });

            detailsTableBody.appendChild(row);
        }

        window.saveDetails = function() {
            const detailsTableBody = document.getElementById('details-table-body');
            const detailsRows = detailsTableBody.querySelectorAll('tr');

            const details = [];
            detailsRows.forEach(row => {
                const cells = row.querySelectorAll('select, input');
                details.push({
                    category_type: cells[0].value,
                    category: cells[1].value,
                    fiscal_year: cells[2].value,
                    topline_amount: cells[3].value,
                    bottomline_amount: cells[4].value,
                    target_distribution: cells[5].value
                });
            });

            const mainTableBody = document.getElementById('main-table-body');
            const mainRow = mainTableBody.rows[currentMainRowIndex];
            mainRow.details = details;

            $('#details-modal').modal('hide');
        }
    }

    fetchOptions();
}

const style = document.createElement('style');
style.innerHTML = `
    .custom-modal-dialog {
        max-width: 80%; 
    }
`;
document.head.appendChild(style);

