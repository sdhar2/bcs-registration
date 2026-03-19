from flask_cors import CORS
from flask import Flask, request, jsonify

import psycopg2

app = Flask(__name__)
CORS(app)
conn = psycopg2.connect(
    host="127.0.0.1",
    port=5432,
    database="bcs_registration",
    user="postgres",
    password="Monika#30"
)


@app.route('/members', methods=['POST'])
def create_member():
    try:
        cur = conn.cursor()
        data = request.get_json()
        
       # Add debug statement
        print('Received data:', data)
        
        # Check if 'middleName' field is present, otherwise assign None
        middle_name = data.get('middleName')
        spouse_name = data.get('spouse')
        children_names = data.get('children')
        address1_name = data.get('address1')
        address2_name = data.get('address2')
        city_name = data.get('city')
        state_name = data.get('state')
        zipcode = data.get('zip')
        homephone_number = data.get('homePhone')
        cellphone_number = data.get('cellPhone')
        cellphone2_number = data.get('cellPhone2')
        pledged_amt = data.get('pledged')
        paid_amt = data.get('paid')
        email_address = data.get('email')
        member_status = data.get('status')
        
         
        query = """
            INSERT INTO bcs_members (firstName, lastName, middleName, spouse, children, address1, address2, city, state, zip, homePhone, cellPhone, cellPhone2, pledged, paid, email, status, lifeMember)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING personId;
        """
        cur.execute(query, (
            data['firstName'],
            data['lastName'],
            middle_name,
            spouse_name,
            children_names,
            address1_name,
            address2_name,
            city_name,
            state_name,
            zipcode,
            homephone_number,
            cellphone_number,
            cellphone2_number,
            pledged_amt,
            paid_amt,
            email_address,
            member_status,
            data['lifeMember']
        ))
        person_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({'personId': person_id}), 201
    except Exception as e:
        conn.rollback()
        
        # Add debug statement
        print('Error:', str(e))
        
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/members/<int:person_id>', methods=['PUT'])
def update_member(person_id):
    try:
        cur = conn.cursor()
        data = request.get_json()
        query = """
            UPDATE bcs_members
            SET firstName = %s,
                lastName = %s,
                middleName = %s,
                spouse = %s,
                children = %s,
                address1 = %s,
                address2 = %s,
                city = %s,
                state = %s,
                zip = %s,
                homePhone = %s,
                cellPhone = %s,
                cellPhone2 = %s,
                pledged = %s,
                paid = %s,
                email = %s,
                status = %s,
                lifeMember = %s
            WHERE personId = %s;
        """
        cur.execute(query, (
            data['firstName'],
            data['lastName'],
            data['middleName'],
            data['spouse'],
            data['children'],
            data['address1'],
            data['address2'],
            data['city'],
            data['state'],
            data['zip'],
            data['homePhone'],
            data['cellPhone'],
            data['cellPhone2'],
            data['pledged'],
            data['paid'],
            data['email'],
            data['status'],
            data['lifeMember'],
            person_id
        ))
        conn.commit()
        return jsonify({'personId': person_id}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/members/<int:person_id>', methods=['DELETE'])
def delete_member(person_id):
    try:
        cur = conn.cursor()
        query = """
            DELETE FROM bcs_members
            WHERE personId = %s;
        """
        cur.execute(query, (person_id,))
        conn.commit()
        return jsonify({'personId': person_id}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()

# Members API

@app.route('/members/<int:person_id>', methods=['GET'])
def get_member(person_id):
    try:
        cur = conn.cursor()
        query = """
            SELECT * FROM bcs_members WHERE personId = %s;
        """
        cur.execute(query, (person_id,))
        row = cur.fetchone()
        if row:
            member = {
                'personId': row[0],
                'firstName': row[1],
                'lastName': row[2],
                'middleName': row[3],
                'spouse': row[4],
                'children': row[5],
                'address1': row[6],
                'address2': row[7],
                'city': row[8],
                'state': row[9],
                'zip': row[10],
                'homePhone': row[11],
                'cellPhone': row[12],
                'cellPhone2': row[13],
                'pledged': row[14],
                'paid': row[15],
                'email': row[16],
                'status': row[17],
                'lifeMember': row[18]
            }
            print('Retrived member', member) # Debug statement
            return jsonify(member), 200
        else:
            print('Member not found') # Debug statement
            return jsonify({'message': 'Member not found'}), 404
    except Exception as e:
        print('Error', str(e)) # Debug statement
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()

@app.route('/members', methods=['GET'])
def get_all_members():
    try:
        cur = conn.cursor()
        query = """
            SELECT * FROM bcs_members;
        """
        cur.execute(query)
        rows = cur.fetchall()
        members = []
        for row in rows:
            member = {
                'personId': row[0],
                'firstName': row[1],
                'lastName': row[2],
                'middleName': row[3],
                'spouse': row[4],
                'children': row[5],
                'address1': row[6],
                'address2': row[7],
                'city': row[8],
                'state': row[9],
                'zip': row[10],
                'homePhone': row[11],
                'cellPhone': row[12],
                'cellPhone2': row[13],
                'pledged': row[14],
                'paid': row[15],
                'email': row[16],
                'status': row[17],
                'lifeMember': row[18]
            }
            members.append(member)
        return jsonify(members), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


# Events API

@app.route('/events', methods=['POST'])
def create_event():
    print("Received Event Post request");
    try:
        cur = conn.cursor()
        data = request.get_json()
        query = """
            INSERT INTO bcs_events (eventName, eventDate)
            VALUES (%s, %s)
            RETURNING eventId;
        """
        cur.execute(query, (
            data['eventName'],
            data['eventDate']
        ))
        event_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({'eventId': event_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    try:
        cur = conn.cursor()
        data = request.get_json()
        query = """
            UPDATE bcs_events
            SET eventName = %s,
                eventDate = %s
            WHERE eventId = %s;
        """
        cur.execute(query, (
            data['eventName'],
            data['eventDate'],
            event_id
        ))
        conn.commit()
        return jsonify({'eventId': event_id}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    try:
        cur = conn.cursor()
        query = """
            DELETE FROM bcs_events
            WHERE eventId = %s;
        """
        cur.execute(query, (event_id,))
        conn.commit()
        return jsonify({'eventId': event_id}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/events/<int:event_id>', methods=['GET'])
def get_event(event_id):
    try:
        cur = conn.cursor()
        query = """
            SELECT * FROM bcs_events WHERE eventId = %s;
        """
        cur.execute(query, (event_id,))
        row = cur.fetchone()
        if row:
            event = {
                'eventId': row[0],
                'eventName': row[1],
                'eventDate': row[2].isoformat()
            }
            return jsonify(event), 200
        else:
            return jsonify({'message': 'Event not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()

@app.route('/events', methods=['GET'])
def get_all_events():
    print("Received Request");
    try:
        cur = conn.cursor()
        query = """
            SELECT * FROM bcs_events;
        """
        cur.execute(query)
        rows = cur.fetchall()
        events = []
        for row in rows:
            event = {
                'eventId': row[0],
                'eventName': row[1],
                'eventDate': row[2].isoformat()
            }
            events.append(event)
        return jsonify(events), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


# Contributions API

@app.route('/contributions', methods=['POST'])
def create_contribution():
    try:
        cur = conn.cursor()
        data = request.get_json()
        query = """
            INSERT INTO bcs_contributions (personId, eventId, dateEntered, contributionAmount, notes, receiptNumber)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING contributionId;
        """
        cur.execute(query, (
            data['personId'],
            data['eventId'],
            data['dateEntered'],
            data['contributionAmount'],
            data['notes'],
            data['receiptNumber']
        ))
        contribution_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({'contributionId': contribution_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()

@app.route('/persons/<int:person_id>/contributions', methods=['GET'])
def get_contributions_for_person(person_id):
    # Code to retrieve contributions for a person
    # ...

## @app.route('/contributions/<int:person_id>', methods=['GET'])
## def get_contributions(person_id): 
    try:
        cur = conn.cursor()
        query = """
            SELECT * FROM bcs_contributions WHERE personId = %s;
        """
        cur.execute(query, (person_id,))
        rows = cur.fetchall()
        contributions = []
        for row in rows:
            contribution = {
                'contributionId': row[0],
                'personId': row[1],
                'eventId': row[2],
                'dateEntered': row[3].isoformat(),
                'contributionAmount': row[4],
                'notes': row[5],
                'receiptNumber': row[6]
            }
            contributions.append(contribution)
        return jsonify(contributions), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/contributions/<int:contribution_id>', methods=['GET'])
def get_contribution(contribution_id):
    try:
        cur = conn.cursor()
        query = """
            SELECT * FROM bcs_contributions WHERE contributionId = %s;
        """
        cur.execute(query, (contribution_id,))
        row = cur.fetchone()
        if row:
            contribution = {
                'contributionId': row[0],
                'personId': row[1],
                'eventId': row[2],
                'dateEntered': row[3].isoformat(),
                'contributionAmount': row[4],
                'notes': row[5],
                'receiptNumber': row[6]
            }
            return jsonify(contribution), 200
        else:
            return jsonify({'message': 'Contribution not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/contributions/<int:contribution_id>', methods=['PUT'])
def update_contribution(contribution_id):
    try:
        cur = conn.cursor()
        data = request.get_json()
        query = """
            UPDATE bcs_contributions
            SET personId = %s,
                eventId = %s,
                dateEntered = %s,
                contributionAmount = %s,
                notes = %s,
                receiptNumber = %s
            WHERE contributionId = %s;
        """
        cur.execute(query, (
            data['personId'],
            data['eventId'],
            data['dateEntered'],
            data['contributionAmount'],
            data['notes'],
            data['receiptNumber'],
            contribution_id
        ))
        conn.commit()
        return jsonify({'contributionId': contribution_id}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()


@app.route('/contributions/<int:contribution_id>', methods=['DELETE'])
def delete_contribution(contribution_id):
    try:
        cur = conn.cursor()
        query = """
            DELETE FROM bcs_contributions
            WHERE contributionId = %s;
        """
        cur.execute(query, (contribution_id,))
        conn.commit()
        return jsonify({'contributionId': contribution_id}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()

# API endpoint for member search

@app.route('/members/search', methods=['GET'])
def search_member():
    try:
        # Extract query parameters from the request and convert to lowercase
        first_name = request.args.get('first_name', '').lower()
        last_name = request.args.get('last_name', '').lower()
        city = request.args.get('city', '').lower()
        state = request.args.get('state', '').lower()

        # Build the SQL query dynamically based on the provided parameters
        query = "SELECT * FROM bcs_members WHERE 1=1"

        params = []

        if first_name:
            query += " AND LOWER(firstName) ILIKE %s"
            params.append(f"%{first_name}%")

        if last_name:
            query += " AND LOWER(lastName) ILIKE %s"
            params.append(f"%{last_name}%")

        if city:
            query += " AND LOWER(city) ILIKE %s"
            params.append(f"%{city}%")

        if state:
            query += " AND LOWER(state) ILIKE %s"
            params.append(f"%{state}%")

        # Execute the SQL query
        cur = conn.cursor()
        cur.execute(query, params)
        results = cur.fetchall()
        cur.close()

        # Convert the results to JSON and return
        return jsonify({'results': results}), 200
    except Exception as e:
        # Handle errors and return an appropriate response
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/data', methods=['GET'])
def get_data():
        print("Request received")
        data = {'message': 'Hello from the backend!'}
        return jsonify(data), 200

if __name__ == '__main__':
    app.run()
