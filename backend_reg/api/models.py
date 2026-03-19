from django.db import models


class BCSMember(models.Model):
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, null=True, blank=True)
    spouse = models.CharField(max_length=50, null=True, blank=True)
    children = models.CharField(max_length=100, null=True, blank=True)
    address1 = models.CharField(max_length=50, null=True, blank=True)
    address2 = models.CharField(max_length=50, null=True, blank=True)
    city = models.CharField(max_length=30, null=True, blank=True)
    state = models.CharField(max_length=2, null=True, blank=True)
    zip = models.CharField(max_length=5, null=True, blank=True)
    home_phone = models.CharField(max_length=15, null=True, blank=True)
    cell_phone = models.CharField(max_length=15, null=True, blank=True)
    pledged = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    paid = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    email = models.CharField(max_length=100, null=True, blank=True)
    status = models.CharField(max_length=10, null=True, blank=True)
    phone = models.CharField(max_length=15, null=True, blank=True)
    life_member = models.BooleanField(default=False)
    member_status = models.SmallIntegerField(null=True, blank=True)


class BCSEvent(models.Model):
    name = models.CharField(max_length=30)
    date = models.DateField()


class BCSContribution(models.Model):
    person = models.ForeignKey(BCSMember, on_delete=models.CASCADE)
    event = models.ForeignKey(BCSEvent, on_delete=models.CASCADE)
    date_entered = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=20, null=True, blank=True)
    receipt_number = models.IntegerField(null=True, blank=True)
