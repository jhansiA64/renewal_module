import base64
import datetime
import json
import math
import operator
import re
import time
import typing
from code import compile_command
from enum import Enum
from typing import Any, Literal, Optional, TypeVar, Union
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlparse, urlunparse

from click import secho
from dateutil import parser
from dateutil.parser import ParserError
from dateutil.relativedelta import relativedelta

import frappe
from frappe import _
from frappe.desk.utils import slug

DateTimeLikeObject = Union[str, datetime.date, datetime.datetime]
NumericType = Union[int, float]

if typing.TYPE_CHECKING:
	T = TypeVar("T")


DATE_FORMAT = "%Y-%m-%d"
TIME_FORMAT = "%H:%M:%S.%f"
DATETIME_FORMAT = f"{DATE_FORMAT} {TIME_FORMAT}"
TIMEDELTA_DAY_PATTERN = re.compile(
	r"(?P<days>[-\d]+) day[s]*, (?P<hours>\d+):(?P<minutes>\d+):(?P<seconds>\d[\.\d+]*)"
)
TIMEDELTA_BASE_PATTERN = re.compile(r"(?P<hours>\d+):(?P<minutes>\d+):(?P<seconds>\d[\.\d+]*)")
URLS_HTTP_TAG_PATTERN = re.compile(
	r'(href|src){1}([\s]*=[\s]*[\'"]?)((?:http)[^\'">]+)([\'"]?)'
)  # href='https://...
URLS_NOT_HTTP_TAG_PATTERN = re.compile(
	r'(href|src){1}([\s]*=[\s]*[\'"]?)((?!http)[^\'" >]+)([\'"]?)'
)  # href=/assets/...
URL_NOTATION_PATTERN = re.compile(
	r'(:[\s]?url)(\([\'"]?)((?!http)[^\'" >]+)([\'"]?\))'
)  # background-image: url('/assets/...')
DURATION_PATTERN = re.compile(r"^(?:(\d+d)?((^|\s)\d+h)?((^|\s)\d+m)?((^|\s)\d+s)?)$")
HTML_TAG_PATTERN = re.compile("<[^>]+>")
MARIADB_SPECIFIC_COMMENT = re.compile(r"#.*")

class Weekday(Enum):
	Sunday = 0
	Monday = 1
	Tuesday = 2
	Wednesday = 3
	Thursday = 4
	Friday = 5
	Saturday = 6


@typing.overload
def add_to_date(
	date,
	years=0,
	months=0,
	weeks=0,
	days=0,
	hours=0,
	minutes=0,
	seconds=0,
	as_string: Literal[False] = False,
	as_datetime: Literal[False] = False,
) -> datetime.date:
	...


@typing.overload
def add_to_date(
	date,
	years=0,
	months=0,
	weeks=0,
	days=0,
	hours=0,
	minutes=0,
	seconds=0,
	as_string: Literal[False] = False,
	as_datetime: Literal[True] = True,
) -> datetime.datetime:
	...


@typing.overload
def add_to_date(
	date,
	years=0,
	months=0,
	weeks=0,
	days=0,
	hours=0,
	minutes=0,
	seconds=0,
	as_string: Literal[True] = True,
	as_datetime: bool = False,
) -> str:
	...


def add_to_date(
	date: DateTimeLikeObject,
	years=0,
	months=0,
	weeks=0,
	days=0,
	hours=0,
	minutes=0,
	seconds=0,
	as_string=False,
	as_datetime=False,
) -> DateTimeLikeObject:
	"""Adds `days` to the given date"""

	if date is None:
		date = now_datetime()

	if hours:
		as_datetime = True

	if isinstance(date, str):
		as_string = True
		if " " in date:
			as_datetime = True
		try:
			date = parser.parse(date)
		except ParserError:
			frappe.throw(frappe._("Please select a valid date filter"), title=frappe._("Invalid Date"))

	date = date + relativedelta(
		years=years, months=months, weeks=weeks, days=days, hours=hours, minutes=minutes, seconds=seconds
	)

	if as_string:
		if as_datetime:
			return date.strftime(DATETIME_FORMAT)
		else:
			return date.strftime(DATE_FORMAT)
	else:
		return date

def now_datetime():
	dt = convert_utc_to_system_timezone(datetime.datetime.utcnow())
	return dt.replace(tzinfo=None)

def convert_utc_to_system_timezone(utc_timestamp):
	# time_zone = get_system_timezone()
	time_zone = "India Time - Asia/Kolkata"
	return convert_utc_to_timezone(utc_timestamp, time_zone)

def t_get_system_timezone():
	frappe.msgprint("<pre>{}</pre>".format(frappe.get_system_settings("time_zone")))
	# return frappe.get_system_settings("time_zone") or "Asia/Kolkata"  # Default to India ?!
	return "India Time - Asia/Kolkata"


def get_system_timezone():
	if frappe.local.flags.in_test:
		# frappe.msgprint("<pre>{}</pre>".format(t_get_system_timezone))
		return t_get_system_timezone()
	# frappe.msgprint("<pre>{}</pre>".format(t_get_system_timezone))	

	return frappe.cache.get_value("time_zone", "India Time - Asia/Kolkata")


def convert_utc_to_timezone(utc_timestamp, time_zone):
	from pytz import UnknownTimeZoneError, timezone

	utcnow = timezone("UTC").localize(utc_timestamp)
	try:
		return utcnow.astimezone(timezone(time_zone))
	except UnknownTimeZoneError:
		return utcnow


def getdate(
	string_date: Optional["DateTimeLikeObject"] = None, parse_day_first: bool = False
) -> datetime.date | None:
	"""
	Converts string date (yyyy-mm-dd) to datetime.date object.
	If no input is provided, current date is returned.
	"""
	if not string_date:
		return get_datetime().date()
	if isinstance(string_date, datetime.datetime):
		return string_date.date()

	elif isinstance(string_date, datetime.date):
		return string_date

	if is_invalid_date_string(string_date):
		return None
	try:
		return parser.parse(string_date, dayfirst=parse_day_first).date()
	except ParserError:
		frappe.throw(
			frappe._("{} is not a valid date string.").format(frappe.bold(string_date)),
			title=frappe._("Invalid Date"),
		)


def get_first_day_of_the_week() -> str:
	return frappe.get_system_settings("first_day_of_the_week") or "Sunday"

def get_start_of_week_index() -> int:
	return Weekday[get_first_day_of_the_week()].value


def get_weekdays():
	return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def get_weekday(datetime: datetime.datetime | None = None) -> str:
	if not datetime:
		datetime = now_datetime()
	weekdays = get_weekdays()
	return weekdays[datetime.weekday()]




@frappe.whitelist()
def get_timespan_date_range(timespan: str) -> tuple[datetime.datetime, datetime.datetime] | None:
	today = getdate()

	match timespan:
		case "last week":
			return (
				get_first_day_of_week(add_to_date(today, days=-7)),
				get_last_day_of_week(add_to_date(today, days=-7)),
			)
		case "last month":
			return (
				get_first_day(add_to_date(today, months=-1)),
				get_last_day(add_to_date(today, months=-1)),
			)
		case "last quarter":
			return (
				get_quarter_start(add_to_date(today, months=-3)),
				get_quarter_ending(add_to_date(today, months=-3)),
			)
		case "last 6 months":
			return (
				get_quarter_start(add_to_date(today, months=-6)),
				get_quarter_ending(add_to_date(today, months=-3)),
			)
		case "last year":
			return (
				get_year_start(add_to_date(today, years=-1)),
				get_year_ending(add_to_date(today, years=-1)),
			)

		case "yesterday":
			return (add_to_date(today, days=-1),) * 2
		case "today":
			return (today, today)
		case "tomorrow":
			return (add_to_date(today, days=1),) * 2
		case "this week":
			return (get_first_day_of_week(today), get_last_day_of_week(today))
		case "this month":
			return (get_first_day(today), get_last_day(today))
		case "this quarter":
			return (get_quarter_start(today), get_quarter_ending(today))
		case "this year":
			return (get_year_start(today), get_year_ending(today))
		case "next week":
			return (
				get_first_day_of_week(add_to_date(today, days=7)),
				get_last_day_of_week(add_to_date(today, days=7)),
			)
		case "next month":
			return (
				get_first_day(add_to_date(today, months=1)),
				get_last_day(add_to_date(today, months=1)),
			)
		case "next quarter":
			return (
				get_quarter_start(add_to_date(today, months=3)),
				get_quarter_ending(add_to_date(today, months=3)),
			)
		case "next 6 months":
			return (
				get_quarter_start(add_to_date(today, months=3)),
				get_quarter_ending(add_to_date(today, months=6)),
			)
		case "next year":
			return (
				get_year_start(add_to_date(today, years=1)),
				get_year_ending(add_to_date(today, years=1)),
			)
		case _:
			return

def get_quarter_start(dt, as_str: bool = False) -> str | datetime.date:
	date = getdate(dt)
	quarter = (date.month - 1) // 3 + 1
	first_date_of_quarter = datetime.date(date.year, ((quarter - 1) * 3) + 1, 1)
	return first_date_of_quarter.strftime(DATE_FORMAT) if as_str else first_date_of_quarter


def get_first_day_of_week(dt, as_str=False):
	dt = getdate(dt)
	date = dt - datetime.timedelta(days=get_week_start_offset_days(dt))
	return date.strftime(DATE_FORMAT) if as_str else date


def get_week_start_offset_days(dt):
	current_day_index = get_normalized_weekday_index(dt)
	start_of_week_index = get_start_of_week_index()

	if current_day_index >= start_of_week_index:
		return current_day_index - start_of_week_index
	else:
		return 7 - (start_of_week_index - current_day_index)

def get_normalized_weekday_index(dt):
	# starts Sunday with 0
	return (dt.weekday() + 1) % 7		

def get_year_start(dt, as_str=False):
	dt = getdate(dt)
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(dt)))
	date = datetime.date(dt.year, 4, 1)
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
	return date.strftime(DATE_FORMAT) if as_str else date


def get_last_day(dt):
	"""
	Returns last day of the month using:
	`get_first_day(dt, 0, 1) + datetime.timedelta(-1)`
	"""
	return get_first_day(dt, 0, 1) + datetime.timedelta(-1)


def is_last_day_of_the_month(dt):
	last_day_of_the_month = get_last_day(dt)

	return getdate(dt) == getdate(last_day_of_the_month)

def get_last_day_of_week(dt):
	dt = get_first_day_of_week(dt)
	return dt + datetime.timedelta(days=6)

@typing.overload
def get_first_day(dt, d_years=0, d_months=0, as_str: Literal[False] = False) -> datetime.date:
	...


@typing.overload
def get_first_day(dt, d_years=0, d_months=0, as_str: Literal[True] = False) -> str:
	...


# TODO: first arg
def get_first_day(
	dt, d_years: int = 0, d_months: int = 0, as_str: bool = False
) -> str | datetime.date:
	"""
	Returns the first day of the month for the date specified by date object
	Also adds `d_years` and `d_months` if specified
	"""
	dt = getdate(dt)

	# d_years, d_months are "deltas" to apply to dt
	overflow_years, month = divmod(dt.month + d_months - 1, 12)
	year = dt.year + d_years + overflow_years

	return (
		datetime.date(year, month + 1, 1).strftime(DATE_FORMAT)
		if as_str
		else datetime.date(year, month + 1, 1)
	)


@typing.overload
def get_quarter_start(dt, as_str: Literal[False] = False) -> datetime.date:
	...


@typing.overload
def get_quarter_start(dt, as_str: Literal[True] = False) -> str:
	...


def get_quarter_start(dt, as_str: bool = False) -> str | datetime.date:
	date = getdate(dt)
	quarter = (date.month - 1) // 3 + 1
	first_date_of_quarter = datetime.date(date.year, ((quarter - 1) * 3) + 1, 1)
	return first_date_of_quarter.strftime(DATE_FORMAT) if as_str else first_date_of_quarter


def get_quarter_ending(date):
	date = getdate(date)

	# find the earliest quarter ending date that is after
	# the given date
	for month in (3, 6, 9, 12):
		quarter_end_month = getdate(f"{date.year}-{month}-01")
		quarter_end_date = getdate(get_last_day(quarter_end_month))
		if date <= quarter_end_date:
			date = quarter_end_date
			break

	return date

def get_year_ending(date) -> datetime.date:
	"""returns year ending of the given date"""
	date = getdate(date)
	next_year_start = datetime.date(date.year + 1, 4, 1)
	return add_to_date(next_year_start, days=-1)



def get_datetime(
	datetime_str: Optional["DateTimeLikeObject"] = None,
) -> datetime.datetime | None:

	if datetime_str is None:
		return now_datetime()

	if isinstance(datetime_str, (datetime.datetime, datetime.timedelta)):
		return datetime_str

	elif isinstance(datetime_str, (list, tuple)):
		return datetime.datetime(datetime_str)

	elif isinstance(datetime_str, datetime.date):
		return datetime.datetime.combine(datetime_str, datetime.time())

	if is_invalid_date_string(datetime_str):
		return None

	try:
		return datetime.datetime.strptime(datetime_str, DATETIME_FORMAT)
	except ValueError:
		return parser.parse(datetime_str)


def is_invalid_date_string(date_string: str) -> bool:
	# dateutil parser does not agree with dates like "0001-01-01" or "0000-00-00"
	return not isinstance(date_string, str) or (
		(not date_string) or (date_string or "").startswith(("0001-01-01", "0000-00-00"))
	)


