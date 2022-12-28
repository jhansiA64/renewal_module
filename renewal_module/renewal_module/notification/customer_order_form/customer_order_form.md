<h3>Customer Order Forem submitted</h3>

<p>Your COF Stage changed to</p>
<h4>{{ doc.status }}</h4>
<p>Account Name:{{doc.customer}}</p>
<p>COF Name:{{ doc.name }}</p>
<p>COF Link:<a href="{frappe.utils.get_url_to_form(doc.doctype,doc.name)}">{{ doc.name }}</a></p>
<p>Sales Person:{{ doc.sales_person }}</p>
