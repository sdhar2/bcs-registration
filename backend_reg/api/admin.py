from django.contrib import admin

# Register your models here.
# api/admin.py

from .models import BCSMember, BCSEvent, BCSContribution

admin.site.register(BCSMember)
admin.site.register(BCSEvent) 
admin.site.register(BCSContribution)