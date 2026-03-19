from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import connection


# Define a view function to handle the /events endpoint
@csrf_exempt
def get_all_events(request):
    if request.method == 'GET':
        # Retrieve events from the database
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM bcs_events;')
            events = [{'eventId': row[0], 'eventName': row[1], 'eventDate': row[2].isoformat()} for row in cursor.fetchall()]
        
        return JsonResponse(events, safe=False)
    else:
        return JsonResponse({'message': 'Unsupported method'}, status=405)

def events_list(request):

  events = [...]
  
  response = JsonResponse(events, safe=False)
  response["Access-Control-Allow-Origin"] = "http://localhost:3000" 
  return response

def get_data(request):
    print("Request received")
    data = {'message': 'Hello from the backend!'}
    return JsonResponse(data)

