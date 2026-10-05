"""
BCS – Members with Outstanding 2026 Membership
-----------------------------------------------
Reports all non-life members who have NOT paid the '2026 Membership' event.

Run (requires the Docker stack to be up):
    python3 generate_2026_report.py
"""

import sys
import csv
import html
import json
import subprocess
from datetime import datetime

CONTAINER   = "bcs_db"
DB_USER     = "bcs_user"
DB_NAME     = "bcs_registration"
EVENT_NAME  = "2026 Membership"   # exact event name to match (case-insensitive)

SQL = f"""
SELECT
    m.personid,
    m.lastname,
    m.firstname,
    COALESCE(m.spouse,    '') AS spouse,
    COALESCE(m.email,     '') AS email,
    COALESCE(m.cellphone, '') AS cellphone,
    COALESCE(m.homephone, '') AS homephone,
    COALESCE(m.city,      '') AS city,
    COALESCE(m.state,     '') AS state,
    COALESCE(m.status,    '') AS status
FROM bcs_members m
WHERE (m.lifemember IS NULL OR m.lifemember = FALSE)
  AND LOWER(m.status) = 'active'
  AND m.personid NOT IN (
        SELECT DISTINCT c.personid
        FROM bcs_contributions c
        JOIN bcs_events e ON e.eventid = c.eventid
        WHERE LOWER(e.eventname) = LOWER('{EVENT_NAME}')
      )
ORDER BY m.lastname, m.firstname;
"""

# ── Run query via docker exec ───────────────────────────────────────────────
def fetch_rows():
    """Execute SQL inside the running bcs_db Docker container."""
    cmd = [
        "docker", "exec", CONTAINER,
        "psql", "-U", DB_USER, "-d", DB_NAME,
        "--tuples-only", "--no-align", "--field-separator=\t",
        "-c", SQL,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        print("❌  'docker' command not found. Make sure Docker Desktop is installed.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"❌  psql error:\n{e.stderr}")
        print("    Make sure the Docker stack is running:  docker compose up -d")
        sys.exit(1)

    cols = ["personid","lastname","firstname","spouse","email",
            "cellphone","homephone","city","state","status"]
    rows = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) == len(cols):
            rows.append(dict(zip(cols, parts)))
    return rows

# ── CSV output ──────────────────────────────────────────────────────────────
def write_csv(rows, path):
    headers = ["#", "Last Name", "First Name", "Spouse", "Email",
               "Cell Phone", "Home Phone", "City", "State", "Status"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for i, r in enumerate(rows, 1):
            w.writerow([i, r["lastname"], r["firstname"], r["spouse"],
                        r["email"], r["cellphone"], r["homephone"],
                        r["city"], r["state"], r["status"]])
    print(f"  CSV  →  {path}")

# ── HTML output ─────────────────────────────────────────────────────────────
def write_html(rows, path):
    now   = datetime.now().strftime("%B %d, %Y  %I:%M %p")
    count = len(rows)

    def e(v): return html.escape(str(v))

    rows_html = ""
    for i, r in enumerate(rows, 1):
        loc = e(r["city"])
        if r["state"]:
            loc += f", {e(r['state'])}"
        rows_html += f"""
        <tr>
          <td class="num">{i}</td>
          <td>{e(r['lastname'])}, {e(r['firstname'])}</td>
          <td>{e(r['spouse'])}</td>
          <td><a href="mailto:{e(r['email'])}">{e(r['email'])}</a></td>
          <td>{e(r['cellphone'])}</td>
          <td>{e(r['homephone'])}</td>
          <td>{loc}</td>
          <td><span class="badge {e(r['status']).lower()}">{e(r['status'])}</span></td>
        </tr>"""

    content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BCS – Outstanding 2026 Membership</title>
<style>
  *      {{ box-sizing:border-box; margin:0; padding:0; }}
  body   {{ font-family:'Segoe UI',Arial,sans-serif; background:#f4f6f9; color:#333; }}
  .page  {{ max-width:1100px; margin:32px auto; padding:0 20px 40px; }}

  header {{ background:#1a3a5c; color:#fff; border-radius:8px 8px 0 0; padding:24px 32px; }}
  header h1 {{ font-size:1.5rem; font-weight:700; }}
  header p  {{ font-size:0.88rem; opacity:.75; margin-top:4px; }}

  .summary {{ display:flex; gap:16px; background:#fff;
              border:1px solid #dde3ec; border-top:none; padding:16px 32px; }}
  .kpi     {{ background:#eef3fb; border-radius:6px; padding:12px 24px; text-align:center; }}
  .kpi span  {{ display:block; font-size:2rem; font-weight:700; color:#1a3a5c; }}
  .kpi label {{ font-size:0.78rem; color:#666; }}

  .card {{ background:#fff; border:1px solid #dde3ec; border-top:none;
           border-radius:0 0 8px 8px; overflow-x:auto; }}

  table    {{ width:100%; border-collapse:collapse; font-size:0.88rem; }}
  thead th {{ background:#f0f4fa; color:#1a3a5c; font-weight:600;
              padding:10px 14px; text-align:left; border-bottom:2px solid #c5d3e8; }}
  tbody tr:nth-child(even) {{ background:#f9fbff; }}
  tbody tr:hover           {{ background:#e8f0fb; }}
  td {{ padding:9px 14px; border-bottom:1px solid #eaeef4; vertical-align:middle; }}
  td.num {{ color:#999; font-size:.8rem; width:40px; text-align:right; }}
  a {{ color:#1a6dcc; text-decoration:none; }}
  a:hover {{ text-decoration:underline; }}

  .badge         {{ display:inline-block; padding:2px 8px; border-radius:12px;
                    font-size:.75rem; font-weight:600; }}
  .badge.active  {{ background:#d4edda; color:#1a5c2a; }}
  .badge.inactive{{ background:#fde8e8; color:#8b1a1a; }}

  .footer {{ text-align:center; font-size:.78rem; color:#999; margin-top:16px; }}
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>BCS — Outstanding 2026 Membership</h1>
    <p>Non-life members who have not paid the "{EVENT_NAME}" event</p>
  </header>
  <div class="summary">
    <div class="kpi"><span>{count}</span><label>Members Outstanding</label></div>
    <div class="kpi"><span>2026</span><label>Membership Year</label></div>
  </div>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>#</th><th>Name</th><th>Spouse</th><th>Email</th>
          <th>Cell</th><th>Home</th><th>Location</th><th>Status</th>
        </tr>
      </thead>
      <tbody>{rows_html}
      </tbody>
    </table>
  </div>
  <p class="footer">Generated {now}</p>
</div>
</body>
</html>"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  HTML →  {path}")

# ── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f'\nBCS – Outstanding "{EVENT_NAME}" Report …\n')
    rows = fetch_rows()
    print(f"  Found {len(rows)} member(s) with no payment.\n")

    base = "bcs_outstanding_membership_2026"
    write_csv(rows, f"{base}.csv")
    write_html(rows, f"{base}.html")

    print(f"\nDone. Open  {base}.html  in your browser.")
