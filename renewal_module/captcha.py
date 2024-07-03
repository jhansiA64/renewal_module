# In your ERPNext app, create a file named captcha.py in the appropriate directory

import random
import string
from PIL import Image, ImageDraw, ImageFont
import io
import base64
from frappe.sessions import get_session
import frappe

def generate_captcha():
    # Generate random captcha text
    captcha_text = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    # Store captcha text in session
    session = get_session()
    session.captcha_text = captcha_text
    session.save()

    # Generate captcha image
    image_width = 200
    image_height = 60
    image = Image.new('RGB', (image_width, image_height), color = (255, 255, 255))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('arial.ttf', size=40)

    # Draw captcha text on the image
    draw.text((10, 10), captcha_text, font=font, fill=(0, 0, 0))

    # Convert image to base64 string
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return img_str
