frappe.pages['custom-dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Custom Dashboard',
        single_column: true
    });

    // Add the filter section
    var filter_section = $('<div>', { class: 'filter-section' }).appendTo(page.body);

    // Add dropdown for Lead Status filter
    var filter_dropdown = $('<select>', {
        id: 'lead_status_filter',
        html: `
            <option value="All">All</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
        `,
        change: function() {
            applyFilter();
        }
    }).appendTo(filter_section);

    // Add filter button
    var filter_button = $('<button>', {
        text: 'Apply Filter',
        class: 'btn btn-primary',
        click: function() {
            applyFilter();
        }
    }).appendTo(filter_section);

    // Function to apply the filter and fetch leads based on status
    function applyFilter() {
        var selected_status = $('#lead_status_filter').val();

        // Call API to fetch filtered leads
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Lead',
                filters: selected_status !== 'All' ? { status: selected_status } : {},
                fields: ['name', 'lead_name', 'status', 'email_id']
            },
            callback: function(response) {
                // Clear existing table (if any)
                $('#leads-table').remove();

                // If data is returned, display it in a table
                if (response.message && response.message.length > 0) {
                    displayLeads(response.message);
                } else {
                    $('<div>', {
                        class: 'no-data',
                        text: 'No leads found for the selected filter.'
                    }).appendTo(page.body);
                }
            }
        });
    }

    // Function to display the leads in a table
    function displayLeads(leads) {
        var leads_table = $('<table>', {
            id: 'leads-table',
            class: 'table table-bordered'
        }).appendTo(page.body);

        // Create table headers
        leads_table.append(`
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Email</th>
                </tr>
            </thead>
        `);

        // Add rows for each lead
        var tbody = $('<tbody>').appendTo(leads_table);

        leads.forEach(function(lead) {
            tbody.append(`
                <tr>
                    <td>${lead.lead_name}</td>
                    <td>${lead.status}</td>
                    <td>${lead.email_id}</td>
                </tr>
            `);
        });
    }

    // Initially apply the filter on page load (optional)
    applyFilter();
}
