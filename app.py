from flask import Flask, request, jsonify, g
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from werkzeug.security import generate_password_hash, check_password_hash
import os
from datetime import datetime, timedelta, date
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = ""  # set in your key
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASS", "admin"),
        database=os.getenv("DB_NAME", "todo")
    )

def _iso_date(s: str) -> str:
    """Accepts many date formats and returns YYYY-MM-DD. Falls back to today if unknown."""
    if not s:
        return date.today().isoformat()
    try:
        return datetime.strptime(s, "%Y-%m-%d").date().isoformat()
    except ValueError:
        pass
    try:
        return datetime.strptime(s, "%a, %d %b %Y %H:%M:%S %Z").date().isoformat()
    except ValueError:
        pass
    try:
        return datetime.strptime(s, "%d/%m/%Y").date().isoformat()
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(str(s)).date().isoformat()
    except Exception:
        # If still can't parse, fallback to today
        return date.today().isoformat()

def _hhmm(t: str | None) -> str | None:
    if not t:
        return None
    try:
        return datetime.strptime(t, "%H:%M").strftime("%H:%M")
    except ValueError:
        return t[:5] if len(t) >= 5 else None

def _row_time_to_str(val):
    """Convert mysql TIME/str/timedelta to HH:MM."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime("%H:%M")
    if isinstance(val, timedelta):
        total = int(val.total_seconds())
        h, r = divmod(total, 3600)
        m, _ = divmod(r, 60)
        return f"{h:02d}:{m:02d}"
    s = str(val)
    return s[:5] if len(s) >= 5 else s

def _task_row_to_dict(t):
    t = dict(t)
    t["date"] = t.get("date").isoformat() if t.get("date") else None
    t["time"] = _row_time_to_str(t.get("time"))
    return t

def add_task_tool(
    title: str,
    description: str,
    category: str,
    date_str: str | None = None,
    time: str | None = None,
    priority: str = "Medium",
    links: str | None = None,
) -> dict:
    """Create a task for the current user. Date must be YYYY-MM-DD; time HH:MM."""
    user_id = g.chat_user_id
    d = _iso_date(date_str or date.today().isoformat())
    tm = _hhmm(time)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            INSERT INTO tasks (user_id, title, description, category, date, time, priority, links, done, sort_order)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (user_id, title, description, category, d, tm, priority, links, 0, 0),
        )
        conn.commit()
        new_id = cursor.lastrowid
        cursor.execute("SELECT * FROM tasks WHERE id=%s", (new_id,))
        row = cursor.fetchone()
        return {"ok": True, "task": _task_row_to_dict(row)}
    finally:
        cursor.close(); conn.close()

def edit_task_tool(
    id: int,
    title: str | None = None,
    description: str | None = None,
    category: str | None = None,
    date_str: str | None = None,
    time: str | None = None,
    priority: str | None = None,
    links: str | None = None,
) -> dict:
    """Edit fields of a task owned by the current user."""
    user_id = g.chat_user_id
    fields, values = [], []
    if title is not None: fields += ["title=%s"]; values += [title]
    if description is not None: fields += ["description=%s"]; values += [description]
    if category is not None: fields += ["category=%s"]; values += [category]
    if date_str is not None: fields += ["date=%s"]; values += [_iso_date(date_str)]
    if time is not None: fields += ["time=%s"]; values += [_hhmm(time)]
    if priority is not None: fields += ["priority=%s"]; values += [priority]
    if links is not None: fields += ["links=%s"]; values += [links]

    if not fields:
        return {"ok": False, "error": "No fields to update."}

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Ensure ownership
        cursor.execute("SELECT id FROM tasks WHERE id=%s AND user_id=%s", (id, user_id))
        if cursor.fetchone() is None:
            return {"ok": False, "error": "Task not found or not owned by user."}

        sql = "UPDATE tasks SET " + ", ".join(fields) + " WHERE id=%s"
        cursor.execute(sql, (*values, id))
        conn.commit()
        cursor.execute("SELECT * FROM tasks WHERE id=%s", (id,))
        row = cursor.fetchone()
        return {"ok": True, "task": _task_row_to_dict(row)}
    finally:
        cursor.close(); conn.close()

def update_task_datetime_tool(id: int, date_str: str, time: str) -> dict:
    """Update a task's date and time."""
    user_id = g.chat_user_id
    d = _iso_date(date_str)
    tm = _hhmm(time)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM tasks WHERE id=%s AND user_id=%s", (id, user_id))
        if cursor.fetchone() is None:
            return {"ok": False, "error": "Task not found or not owned by user."}

        cursor.execute("UPDATE tasks SET date=%s, time=%s, done=0 WHERE id=%s", (d, tm, id))
        conn.commit()
        cursor.execute("SELECT * FROM tasks WHERE id=%s", (id,))
        row = cursor.fetchone()
        return {"ok": True, "task": _task_row_to_dict(row)}
    finally:
        cursor.close(); conn.close()

def delete_task_tool(id: int) -> dict:
    """Delete a task."""
    user_id = g.chat_user_id
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tasks WHERE id=%s AND user_id=%s", (id, user_id))
        conn.commit()
        return {"ok": cursor.rowcount > 0}
    finally:
        cursor.close(); conn.close()

def mark_done_tool(id: int, done: bool = True) -> dict:
    """Mark a task done/undone."""
    user_id = g.chat_user_id
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE tasks SET done=%s WHERE id=%s AND user_id=%s", (1 if done else 0, id, user_id))
        conn.commit()
        return {"ok": cursor.rowcount > 0}
    finally:
        cursor.close(); conn.close()

def list_tasks_tool(when: str = "all", base_date: str | None = None) -> dict:
    """
    List tasks for the current user.
    when: 'all' | 'today' | 'week'
    base_date: anchor date (YYYY-MM-DD); defaults to today.
    """
    user_id = g.chat_user_id
    base = datetime.strptime(_iso_date(base_date or date.today().isoformat()), "%Y-%m-%d").date()

    where, params = ["user_id=%s"], [user_id]
    if when == "today":
        where += ["date=%s"]; params += [base.isoformat()]
    elif when == "week":
        start = base - timedelta(days=base.weekday())  # Monday start
        end = start + timedelta(days=6)
        where += ["date BETWEEN %s AND %s"]; params += [start.isoformat(), end.isoformat()]

    sql = f"SELECT * FROM tasks WHERE {' AND '.join(where)} ORDER BY date ASC, sort_order ASC"
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()
        return {"ok": True, "tasks": [_task_row_to_dict(r) for r in rows]}
    finally:
        cursor.close(); conn.close()


@app.route('/api/send-message', methods=['POST'])
def send_message():
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify(success=False, message="Invalid JSON payload"), 400

    user_id = payload.get('user_id')
    user_message = payload.get('message', '').strip()

    if not user_id or not user_message:
        return jsonify(success=False, message="Missing user_id or message"), 400

    g.chat_user_id = int(user_id)

    # --- Fetch tasks from DB ---
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT * FROM tasks WHERE user_id=%s ORDER BY date ASC, sort_order ASC",
            (user_id,)
        )
        rows = cursor.fetchall()
    except Exception as e:
        return jsonify(success=False, message=f"Database error: {str(e)}"), 500
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass

    # --- Format task list for Gemini ---
    try:
        task_list_text = "\n".join([
            f"[{t.get('id')}] {t.get('title', '')} | {t.get('description', '')} | {t.get('category', '')} | "
            f"{t.get('date', '')} { _row_time_to_str(t.get('time')) or '' } | "
            f"Priority: {t.get('priority', 'Unknown')} | Done: {bool(t.get('done'))}"
            for t in rows
        ]) if rows else "No tasks currently."
    except Exception as e:
        task_list_text = f"Error formatting tasks: {str(e)}"

    today_str = date.today().isoformat()
    system_instruction = (
        "You are a personal task assistant. "
        "Your job is to help the user add, edit, move, delete, and mark tasks done. "
        "Be short, friendly, and efficient. "
        "\n\n"
        f"Today's date is {today_str}.\n"
        "The user’s current tasks are:\n"
        f"{task_list_text}\n\n"
        "### Guidelines:\n"
        "- Never ask for a task ID. Use title + date to identify tasks.\n"
        "- When showing tasks, list: `<number>. Title (Date)` with ✅ if done, ⏳ if pending.\n"
        "- Confirm actions clearly after completing them.\n"
        "- If a task is unclear (e.g., missing date), politely ask for clarification.\n"
        "- Keep replies short and conversational.\n"
    )

    # --- Maintain per-user chat history ---
    if "chat_history" not in g:
        g.chat_history = {}

    if user_id not in g.chat_history:
        g.chat_history[user_id] = []

    history = g.chat_history[user_id]

    # Append latest user msg
    history.append({"role": "user", "parts": [{"text": user_message}]})
    history = history[-10:]  # keep last 10
    g.chat_history[user_id] = history

    # --- Call Gemini ---
    try:
        resp = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=[
                    add_task_tool,
                    edit_task_tool,
                    update_task_datetime_tool,
                    delete_task_tool,
                    mark_done_tool,
                    list_tasks_tool,
                ],
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    maximum_remote_calls=5
                ),
            ),
        )

        reply_text = resp.text or ""

        # Save model reply into history
        history.append({"role": "model", "parts": [{"text": reply_text}]})
        g.chat_history[user_id] = history[-10:]

        return jsonify(
            success=True,
            reply=reply_text
        ), 200

    except Exception as e:
        return jsonify(success=False, message=f"Gemini API error: {str(e)}"), 500

@app.route('/api/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        name, email, password = data.get('name'), data.get('email'), data.get('password')
        if not all([name, email, password]):
            return jsonify(success=False, message="Missing fields"), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM user_info WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify(success=False, message="Email already exists"), 400

        hashed_password = generate_password_hash(password)
        cursor.execute(
            "INSERT INTO user_info (name, email, password) VALUES (%s, %s, %s)",
            (name, email, hashed_password)
        )
        conn.commit()
        return jsonify(success=True, uid=cursor.lastrowid), 201
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email, password = data.get('email'), data.get('password')
        if not all([email, password]):
            return jsonify(success=False, message="Missing fields"), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, password FROM user_info WHERE email = %s", (email,))
        user = cursor.fetchone()
        if not user or not check_password_hash(user['password'], password):
            return jsonify(success=False, message="Invalid email or password"), 401

        return jsonify(success=True, uid=user['id']), 200
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify(success=False, message="Missing user_id"), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT * FROM tasks WHERE user_id = %s ORDER BY date ASC, sort_order ASC",
            (user_id,)
        )
        tasks = cursor.fetchall()

        for t in tasks:
            # Convert datetime to string
            if isinstance(t.get('time'), datetime):
                t['time'] = t['time'].strftime('%H:%M')
            # Convert timedelta to string (HH:MM)
            elif isinstance(t.get('time'), timedelta):
                total_seconds = int(t['time'].total_seconds())
                hours, remainder = divmod(total_seconds, 3600)
                minutes, _ = divmod(remainder, 60)
                t['time'] = f"{hours:02}:{minutes:02}"

        return jsonify(success=True, tasks=tasks), 200

    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/add-task', methods=['POST'])
def add_task():
    try:
        data = request.get_json()
        required = ['user_id', 'title', 'description', 'category', 'date', 'priority']
        if not all(data.get(f) for f in required):
            return jsonify(success=False, message="Missing fields"), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO tasks (user_id, title, description, category, date, time, priority, links, done)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            data['user_id'], data['title'], data['description'], data['category'],
            data['date'], data.get('time'), data['priority'], data.get('links'), data.get('done', 0)
        ))
        conn.commit()
        return jsonify(success=True, id=cursor.lastrowid), 201
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.route('/api/edit-task/<int:task_id>', methods=['PUT'])
def edit_task(task_id):
    try:
        data = request.get_json()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE tasks
            SET title=%s, description=%s, category=%s, date=%s, time=%s, priority=%s, links=%s, done=0
            WHERE id=%s
        """, (
            data['title'], data['description'], data['category'], data['date'], data.get('time'),
            data['priority'], data.get('links'), task_id
        ))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify(success=False, message="Task not found"), 404
        return jsonify(success=True), 200
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.route('/api/update-task/<int:task_id>', methods=['PUT'])
def update_task_datetime(task_id):
    data = request.json
    date = data.get('date')
    time = data.get('time')  # make sure frontend sends this

    if not date or not time:
        return jsonify(success=False, message="Missing date or time"), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE tasks SET date = %s, time = %s, done = 0 WHERE id = %s",
            (date, time, task_id)
        )
        conn.commit()
        return jsonify(success=True), 200
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/delete-task/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE id=%s", (task_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify(success=False, message="Task not found"), 404
        return jsonify(success=True), 200
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.route('/api/mark-done/<int:task_id>', methods=['PUT'])
def mark_done(task_id):
    try:
        data = request.get_json()
        if 'done' not in data:
            return jsonify(success=False, message="Missing 'done' field"), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE tasks SET done=%s WHERE id=%s", (data['done'], task_id))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify(success=False, message="Task not found"), 404
        return jsonify(success=True), 200
    except Error as e:
        return jsonify(success=False, message=str(e)), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()



if __name__ == '__main__':
    app.run(debug=True)
