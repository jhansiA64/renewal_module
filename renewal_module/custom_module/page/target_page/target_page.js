// frappe.pages['target-page'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Sales Targets',
// 		single_column: true
// 	});



// }


frappe.pages['target-page'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Sales Targets',
        single_column: true
    });

    // Create a container for the Plotly graph
    var container = $('<div>')
        .attr('id', 'plotly-graph')
        .css({
            'width': '100%',
            'height': '800px'
        });
    page.main.append(container);

    // Load Plotly library
    $.getScript('https://cdn.plot.ly/plotly-latest.min.js', function() {
        // Fetch data from server-side endpoint
        frappe.call({
            method: "renewal_module.tasks.get_tree_graph_data",
            callback: function(response) {
                var data = response.message;

                // Prepare data for Plotly
                var trace = {
                    type: "sunburst",
                    labels: data.nodes.map(node => node.name),
                    parents: data.nodes.map(() => ""),
                    values: data.nodes.map(node => node.target_amount),
                    marker: {
                        colors: data.nodes.map(node => node.achieved_amount >= node.target_amount ? 'green' : 'red')
                    }
                };

                var layout = {
                    title: "Target vs Achieved Amounts",
                    height: 800,
                    margin: { l: 0, r: 0, t: 50, b: 0 }
                };

                // Render Plotly graph
                Plotly.newPlot('plotly-graph', [trace], layout);
            }
        });
    });
}
