from rest_framework import serializers

from .models import Attendance


class AttendanceSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.full_name', read_only=True)

    class Meta:
        model = Attendance
        fields = [
            'id', 'client', 'client_name', 'lesson_date',
            'is_absent', 'note', 'marked_by', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'marked_by']


class AttendanceMarkSerializer(serializers.Serializer):
    client_id = serializers.UUIDField()
    lesson_date = serializers.DateField()
    is_absent = serializers.BooleanField(default=False)
    note = serializers.CharField(max_length=255, required=False, default='')


class BulkAttendanceMarkSerializer(serializers.Serializer):
    lesson_date = serializers.DateField()
    records = AttendanceMarkSerializer(many=True)

    def validate_records(self, value):
        if not value:
            raise serializers.ValidationError("At least one record required")
        return value
