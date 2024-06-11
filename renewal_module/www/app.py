# from flask import Flask, render_template, request
# import frappe

# app = Flask(__name__)

# @app.route('/sender')
# def sender():
#     dynamic_data = "Hello from Sender"
#     return render_template('sender.html', dynamic_data=dynamic_data)

# @app.route('/receiver')
# def receiver():
#     frappe.msgprint("hello world")
#     parameter_value = request.args.get('parameter')
#     dynamic_data = "Hello from Receiver"
#     # return render_template('receiver.html', dynamic_data=parameter_value)
#     return f'The parameter value is: {parameter_value}'

# if __name__ == '__main__':
#     app.run(debug=True)

from flask import Flask, request, render_template, jsonify
import frappe

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/career', methods=['POST'])
def fetch_job_data():
    data = request.json
    job_name = data.get('name')

    # Fetch the job document using Frappe
    job_list = frappe.get_all("Job Opening", filters={'name': job_name}, fields=['name', 'currency', 'lower_range', 'upper_range'])

    # Render the fetched data using a Jinja template
    return render_template('carrer_job.html', job_list=job_list)

if __name__ == '__main__':
    app.run(debug=True)
