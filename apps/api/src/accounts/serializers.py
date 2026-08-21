from rest_framework import serializers

from accounts.models import User
from config.serializers import StrictSerializer


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email")
        read_only_fields = fields


class NormalizedEmailField(serializers.EmailField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        return User.objects.normalize_email(value).strip().lower()


class SignupSerializer(StrictSerializer):
    email = NormalizedEmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class LoginSerializer(StrictSerializer):
    email = NormalizedEmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class SessionSerializer(serializers.Serializer):
    authenticated = serializers.BooleanField(read_only=True)
    user = UserSerializer(read_only=True, allow_null=True)
    csrf_token = serializers.CharField(read_only=True)
