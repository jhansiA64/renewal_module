# import frappe
# from frappe import _

# @frappe.whitelist()
# def fetch_image(doctype, docname, fieldname):
#     # Fetch the image data from the linked document
#     image_data = frappe.db.get_value(doctype, docname, fieldname)

#     return image_data

from flask import Flask, render_template, request, url_for

app = Flask(__name__)

@app.route('/career')
def career():
    return render_template('career.html')

@app.route('/career',methods=['POST'])
def carrer_job():
    data1 = request.from['name']
    return render_template('carrer_job.html', data=data1)

if __name__ == '__main__':
    app.run(debug=True)