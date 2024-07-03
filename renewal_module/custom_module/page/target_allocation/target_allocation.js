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

frappe.pages['target-allocation'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Target Allocation',
        single_column: true
    });

    $(frappe.render_template("target_sheet_template")).appendTo(page.body);

    // Function to add a new row to the table
    function addRow() {
        var tableBody = $("#target-sheet-table-body");
        var newRow = `<tr>
            <td><input type="text" class="form-control target-name" placeholder="Sales Person" data-fieldname="sales_person" data-doctype="Sales Person"></td>
            <td contenteditable="true"></td>
            <td contenteditable="true"></td>
            <td contenteditable="true"></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        </tr>`;
        tableBody.append(newRow);

        // Initialize link field for the new row
        initializeLinkField(tableBody.find('input.target-name').last());
    }


    // Add initial row
    addRow();

    // Add a new row when the button is clicked
    $("#add-row-btn").click(function() {
        addRow();
    });

    // Remove a row when the remove button is clicked
    $(document).on('click', '.remove-row', function() {
        $(this).closest('tr').remove();
    });

	// Function to initialize link field
    function initializeLinkField(linkField) {
		$(linkField).autocomplete({
            source: function(request, response) {
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: targetField.attr('data-doctype'),
                        filters: {
                            "name": ["like", "%" + request.term + "%"]
                        },
                        limit: 20
                    },
                    callback: function(r) {
                        var results = $.map(r.message, function(item) {
                            return {
                                label: item.name,
                                value: item.name
                            };
                        });
                        response(results);
                    }
                });
            },
            minLength: 1
        });
    }
};


