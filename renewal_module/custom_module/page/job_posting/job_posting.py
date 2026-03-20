import frappe
import json


def _resolve_department_name(dept_value):
	"""Resolve Department link by exact or case-insensitive match."""
	if not dept_value:
		return None

	dept_value = str(dept_value).strip()
	if not dept_value:
		return None

	if frappe.db.exists('Department', dept_value):
		return dept_value

	exact_name = frappe.db.get_value('Department', {'department_name': dept_value}, 'name')
	if exact_name:
		return exact_name

	row = frappe.db.sql(
		"""
		SELECT name
		FROM `tabDepartment`
		WHERE LOWER(name) = LOWER(%s)
		   OR LOWER(IFNULL(department_name, '')) = LOWER(%s)
		LIMIT 1
		""",
		(dept_value, dept_value),
		as_dict=True,
	)

	if row:
		return row[0].get('name')

	return None


def _department_not_found_message(dept_value):
	"""Build a helpful error message when department is not found."""
	suggestions = frappe.get_all(
		'Department',
		filters={'name': ['like', f"%{str(dept_value).strip()}%"]},
		fields=['name'],
		limit=5,
	)

	suggested_names = [d.get('name') for d in suggestions if d.get('name')]
	if suggested_names:
		return f"Could not find Department: {dept_value}. Try one of: {', '.join(suggested_names)}"

	return f"Could not find Department: {dept_value}"

@frappe.whitelist()
def get_page():
	"""Get the Job Posting page with default data"""
	print("🔧 [Job Posting Backend] get_page() called")
	return frappe.render_template('job_posting.html', {})


@frappe.whitelist()
def save_job_posting(job_data):
	"""
	Save a job posting to the database
	Mirrors the candidates.save_candidate() pattern
	
	Parameters:
		job_data: Dict with job posting fields (title, dept, location, type, experience, salary, description)
	
	Returns: Dict with success status and message
	"""
	print(f"💾 [Job Posting Backend] save_job_posting() called")
	print(f"📋 [Job Posting Backend] Received data: {job_data}")
	
	try:
		# Parse data if it's a JSON string
		if isinstance(job_data, str):
			job_data = json.loads(job_data)
		
		# Validate required fields
		if not job_data.get('title'):
			return {'success': False, 'message': 'Job Title is required'}
		if not job_data.get('dept'):
			return {'success': False, 'message': 'Department is required'}
		if not job_data.get('location'):
			return {'success': False, 'message': 'Location is required'}

		resolved_dept = _resolve_department_name(job_data.get('dept'))
		if not resolved_dept:
			return {'success': False, 'message': _department_not_found_message(job_data.get('dept'))}
		
		# Create new Job Opening document
		doc = frappe.new_doc('Job Opening')
		doc.job_title = job_data.get('title', '')
		doc.department = resolved_dept
		doc.location = job_data.get('location', '')
		doc.employment_type = job_data.get('type', '')
		doc.experience_required = job_data.get('experience', '')
		doc.description = job_data.get('description', '')
		doc.salary_range = job_data.get('salary', '')
		doc.status = 'Open'
		
		# Save the document
		doc.insert(ignore_permissions=False)
		frappe.db.commit()
		
		print(f"✅ [Job Posting Backend] Job posting saved with ID: {doc.name}")
		
		return {
			'success': True,
			'message': f'Job posting "{doc.job_title}" created successfully',
			'job_id': doc.name
		}
	
	except frappe.ValidationError as e:
		print(f"❌ [Job Posting Backend] Validation error: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - save_job_posting')
		return {
			'success': False,
			'message': f'Validation error: {str(e)}'
		}
	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in save_job_posting: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - save_job_posting')
		return {
			'success': False,
			'message': str(e)
		}


@frappe.whitelist()
def delete_job(job_id):
	"""
	Delete a job posting from the database
	
	Parameters:
		job_id: Name/ID of the Job Opening to delete
	
	Returns: Dict with success status and message
	"""
	print(f"🗑️ [Job Posting Backend] delete_job() called for ID: {job_id}")
	
	try:
		if not job_id:
			return {'success': False, 'message': 'Job ID is required'}
		
		# Delete the job opening
		frappe.delete_doc('Job Opening', job_id, ignore_permissions=False)
		frappe.db.commit()
		
		print(f"✅ [Job Posting Backend] Job deleted successfully: {job_id}")
		
		return {
			'success': True,
			'message': 'Job posting deleted successfully'
		}
	
	except frappe.DoesNotExistError:
		print(f"❌ [Job Posting Backend] Job not found: {job_id}")
		return {
			'success': False,
			'message': f'Job posting not found: {job_id}'
		}
	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in delete_job: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - delete_job')
		return {
			'success': False,
			'message': str(e)
		}


@frappe.whitelist()
def get_job_openings(filters=None, start=0, page_length=20):
	"""
	Fetch Job Opening records from database
	Returns: List of job openings with formatted data
	"""
	print("📦 [Job Posting Backend] get_job_openings() called")
	print(f"📋 [Job Posting Backend] Filters: {filters}, Start: {start}, Page Length: {page_length}")
	
	try:
		# Parse filters if passed as JSON string
		if isinstance(filters, str):
			filters = json.loads(filters) if filters else {}
		else:
			filters = filters or {}
		
		print(f"✅ [Job Posting Backend] Parsed filters: {filters}")

		# Build base filter
		base_filter = {'docstatus': 0}  # 0 = Draft, 1 = Submitted, 2 = Cancelled
		
		# Add custom filters
		if filters:
			base_filter.update(filters)

		print(f"📋 [Job Posting Backend] Base filter: {base_filter}")

		# Fetch Job Opening records
		job_openings = frappe.get_list(
			'Job Opening',
			filters=base_filter,
			fields=[
				'name',
				'job_title',
				'department',
				'location',
				'employment_type',
				'experience_required',
				'description',
				'status',
				'creation',
				'salary_range'
			],
			start=int(start),
			page_length=int(page_length),
			order_by='creation desc'
		)

		print(f"📦 [Job Posting Backend] Found {len(job_openings)} job openings")

		# Format data for frontend
		formatted_jobs = []
		for idx, job in enumerate(job_openings):
			print(f"📌 [Job Posting Backend] Job #{idx}: {job}")
			
			formatted_job = {
				'id': job.get('name', 'N/A'),
				'title': job.get('job_title', 'Untitled'),
				'dept': job.get('department', 'N/A'),
				'location': job.get('location', 'N/A'),
				'type': job.get('employment_type', 'N/A'),
				'experience': job.get('experience_required', 'N/A'),
				'description': job.get('description', ''),
				'status': job.get('status', 'Open'),
				'posted_on': str(job.get('creation', ''))[:10],  # Get date part only
				'salary': job.get('salary_range', ''),
				'_raw': job  # Keep raw data for debugging
			}
			formatted_jobs.append(formatted_job)
			print(f"✅ [Job Posting Backend] Formatted job: {formatted_job}")

		# Get total count
		total_count = frappe.db.count(
			'Job Opening',
			filters=base_filter
		)
		print(f"📊 [Job Posting Backend] Total records in database: {total_count}")

		response = {
			'status': 'success',
			'data': formatted_jobs,
			'total': total_count,
			'start': start,
			'page_length': page_length,
			'message': f"Fetched {len(formatted_jobs)} jobs"
		}

		print(f"✅ [Job Posting Backend] Response: {response}")
		return response

	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in get_job_openings: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - get_job_openings')
		return {
			'status': 'error',
			'message': str(e),
			'data': []
		}


@frappe.whitelist()
def get_job_opening(job_name):
	"""
	Fetch a single Job Opening record by name
	Returns: Single job opening object with all details
	"""
	print(f"🔍 [Job Posting Backend] get_job_opening() called for: {job_name}")
	
	try:
		if not job_name:
			raise ValueError("Job name/ID is required")

		# Fetch the specific job opening
		job = frappe.get_doc('Job Opening', job_name)
		print(f"✅ [Job Posting Backend] Found job: {job.name}")

		# Format the response
		formatted_job = {
			'id': job.name,
			'title': job.job_title,
			'dept': job.department,
			'location': job.location,
			'type': job.employment_type,
			'experience': job.experience_required,
			'description': job.description,
			'status': job.status,
			'posted_on': str(job.creation)[:10],
			'salary': job.salary_range if hasattr(job, 'salary_range') else '',
			'_raw': job.as_dict()
		}

		print(f"✅ [Job Posting Backend] Formatted job: {formatted_job}")
		return {
			'status': 'success',
			'data': formatted_job
		}

	except frappe.DoesNotExistError:
		print(f"❌ [Job Posting Backend] Job not found: {job_name}")
		return {
			'status': 'error',
			'message': f"Job opening '{job_name}' not found",
			'data': None
		}
	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in get_job_opening: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - get_job_opening')
		return {
			'status': 'error',
			'message': str(e),
			'data': None
		}


@frappe.whitelist()
def create_job_opening(data):
	"""
	Create a new Job Opening record from frontend data
	Parameters:
		data: JSON string or dict with job opening fields
	Returns: Created Job Opening object
	"""
	print(f"💾 [Job Posting Backend] create_job_opening() called")
	print(f"📋 [Job Posting Backend] Received data: {data}")
	
	try:
		# Parse data if it's a JSON string
		if isinstance(data, str):
			data = json.loads(data)
		
		print(f"✅ [Job Posting Backend] Parsed data: {data}")
		dept_input = (data.get('dept') or data.get('department') or '').strip()
		resolved_dept = _resolve_department_name(dept_input) if dept_input else None
		if dept_input and not resolved_dept:
			return {
				'status': 'error',
				'message': _department_not_found_message(dept_input),
				'data': None,
			}

		# Map frontend fields to doctype fields
		job_doc = frappe.new_doc('Job Opening')
		job_doc.job_title = data.get('title', '')
		job_doc.department = resolved_dept or ''
		job_doc.location = data.get('location', '')
		job_doc.employment_type = data.get('type', '')
		job_doc.experience_required = data.get('experience', '')
		job_doc.description = data.get('description', '')
		job_doc.status = data.get('status', 'Open')
		
		# Set salary range if available
		if data.get('salary'):
			job_doc.salary_range = data.get('salary')

		# Validate and save
		job_doc.insert(ignore_permissions=False)
		frappe.db.commit()

		print(f"✅ [Job Posting Backend] Job created with ID: {job_doc.name}")

		return {
			'status': 'success',
			'message': f"Job opening '{job_doc.job_title}' created successfully",
			'data': {
				'id': job_doc.name,
				'title': job_doc.job_title
			}
		}

	except frappe.ValidationError as e:
		print(f"❌ [Job Posting Backend] Validation error: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - Validation Error')
		return {
			'status': 'error',
			'message': f"Validation error: {str(e)}",
			'data': None
		}
	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in create_job_opening: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - create_job_opening')
		return {
			'status': 'error',
			'message': str(e),
			'data': None
		}


@frappe.whitelist()
def update_job_opening(job_name, data):
	"""
	Update an existing Job Opening record
	Parameters:
		job_name: Name/ID of the job opening
		data: JSON string or dict with updated fields
	Returns: Updated Job Opening object
	"""
	print(f"✏️ [Job Posting Backend] update_job_opening() called for: {job_name}")
	print(f"📋 [Job Posting Backend] Update data: {data}")
	
	try:
		# Parse data if it's a JSON string
		if isinstance(data, str):
			data = json.loads(data)
		
		# Fetch existing document
		job_doc = frappe.get_doc('Job Opening', job_name)
		print(f"✅ [Job Posting Backend] Fetched job: {job_doc.name}")

		# Update fields
		if 'title' in data:
			job_doc.job_title = data['title']
		if 'dept' in data:
			resolved_dept = _resolve_department_name(data['dept'])
			if not resolved_dept:
				return {
					'status': 'error',
					'message': _department_not_found_message(data['dept']),
					'data': None,
				}
			job_doc.department = resolved_dept
		if 'location' in data:
			job_doc.location = data['location']
		if 'type' in data:
			job_doc.employment_type = data['type']
		if 'experience' in data:
			job_doc.experience_required = data['experience']
		if 'description' in data:
			job_doc.description = data['description']
		if 'status' in data:
			job_doc.status = data['status']
		if 'salary' in data:
			job_doc.salary_range = data['salary']

		# Save changes
		job_doc.save(ignore_permissions=False)
		frappe.db.commit()

		print(f"✅ [Job Posting Backend] Job updated successfully")

		return {
			'status': 'success',
			'message': f"Job opening updated successfully",
			'data': {
				'id': job_doc.name,
				'title': job_doc.job_title
			}
		}

	except frappe.DoesNotExistError:
		print(f"❌ [Job Posting Backend] Job not found: {job_name}")
		return {
			'status': 'error',
			'message': f"Job opening '{job_name}' not found",
			'data': None
		}
	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in update_job_opening: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - update_job_opening')
		return {
			'status': 'error',
			'message': str(e),
			'data': None
		}


@frappe.whitelist()
def delete_job_opening(job_name):
	"""
	Delete a Job Opening record
	Parameters:
		job_name: Name/ID of the job opening to delete
	Returns: Success/error status
	"""
	print(f"🗑️ [Job Posting Backend] delete_job_opening() called for: {job_name}")
	
	try:
		frappe.delete_doc('Job Opening', job_name, ignore_permissions=False)
		frappe.db.commit()

		print(f"✅ [Job Posting Backend] Job deleted successfully: {job_name}")

		return {
			'status': 'success',
			'message': f"Job opening deleted successfully"
		}

	except frappe.DoesNotExistError:
		print(f"❌ [Job Posting Backend] Job not found: {job_name}")
		return {
			'status': 'error',
			'message': f"Job opening '{job_name}' not found"
		}
	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in delete_job_opening: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - delete_job_opening')
		return {
			'status': 'error',
			'message': str(e)
		}


@frappe.whitelist()
def get_departments():
	"""
	Get list of all departments for dropdown/filter
	Returns: List of unique departments
	"""
	print("📊 [Job Posting Backend] get_departments() called")
	
	try:
		departments = frappe.get_list(
			'Job Opening',
			filters={'docstatus': 0},
			fields=['department'],
			distinct=True,
			order_by='department'
		)

		dept_list = [d.get('department') for d in departments if d.get('department')]
		print(f"✅ [Job Posting Backend] Found {len(dept_list)} departments: {dept_list}")

		return {
			'status': 'success',
			'data': dept_list
		}

	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in get_departments: {str(e)}")
		return {
			'status': 'error',
			'message': str(e),
			'data': []
		}


@frappe.whitelist()
def get_locations():
	"""
	Get list of all locations for dropdown/filter
	Returns: List of unique locations
	"""
	print("📊 [Job Posting Backend] get_locations() called")
	
	try:
		locations = frappe.get_list(
			'Job Opening',
			filters={'docstatus': 0},
			fields=['location'],
			distinct=True,
			order_by='location'
		)

		location_list = [l.get('location') for l in locations if l.get('location')]
		print(f"✅ [Job Posting Backend] Found {len(location_list)} locations: {location_list}")

		return {
			'status': 'success',
			'data': location_list
		}

	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in get_locations: {str(e)}")
		return {
			'status': 'error',
			'message': str(e),
			'data': []
		}


@frappe.whitelist()
def get_candidates_for_job(job_id):
	"""
	Fetch candidates (Job Applicants) for a specific job opening
	Parameters:
		job_id: Job Opening document name
	Returns: List of applicable candidates with their details
	"""
	print(f"👥 [Job Posting Backend] get_candidates_for_job() called for: {job_id}")
	
	try:
		if not job_id:
			raise ValueError("Job ID is required")

		# Fetch Job Applicants linked to this Job Opening
		candidates = frappe.get_list(
			'Job Applicant',
			filters={'designation': job_id},  # Job Opening is stored in 'designation' field
			fields=[
				'name',
				'applicant_name',
				'email_id',
				'phone_number',
				'status',
				'creation',
				'designation',
				'resume_attachment'
			],
			order_by='creation desc'
		)

		print(f"📦 [Job Posting Backend] Found {len(candidates)} candidates for job {job_id}")

		# Format candidates data
		formatted_candidates = []
		for candidate in candidates:
			status_color_map = {
				'Pending': '#f59e0b',
				'Accepted': '#10b981',
				'Rejected': '#ef4444',
				'Accepted and Confirmed': '#06b6d4',
				'Accepted and Joined': '#10b981'
			}
			
			formatted_candidate = {
				'id': candidate.get('name', 'N/A'),
				'name': candidate.get('applicant_name', 'N/A'),
				'email': candidate.get('email_id', 'N/A'),
				'phone': candidate.get('phone_number', 'N/A'),
				'status': candidate.get('status', 'Pending'),
				'statusColor': status_color_map.get(candidate.get('status', 'Pending'), '#6b7280'),
				'appliedOn': str(candidate.get('creation', ''))[:10],
				'resume': candidate.get('resume_attachment', '')
			}
			formatted_candidates.append(formatted_candidate)

		return {
			'status': 'success',
			'data': formatted_candidates,
			'total': len(formatted_candidates),
			'message': f"Fetched {len(formatted_candidates)} candidates"
		}

	except Exception as e:
		print(f"❌ [Job Posting Backend] Error in get_candidates_for_job: {str(e)}")
		frappe.log_error(frappe.get_traceback(), 'Job Posting - get_candidates_for_job')
		return {
			'status': 'error',
			'message': str(e),
			'data': []
		}
