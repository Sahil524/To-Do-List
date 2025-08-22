Task Assistant – Setup Instructions

This project is a Flask-based Task Assistant API powered by Google Gemini AI and backed by MySQL. Follow these steps to set it up on your system.

Prerequisites

Python 3.10 or higher

pip (Python package manager)

MySQL Server (8.0+ recommended)

The provided SQL file (tasks.sql) for database setup

1. Install Dependencies

From the project root directory, install the required packages:

pip install -r requirements.txt

2. Configure Environment Variables

Add the Gemini API key into the app.py - GEMINI_API_KEY

3. Import the Database

mysql -u your_mysql_user -p your_database_name < to-do.sql

4. Run the Application

npm start

python app.py