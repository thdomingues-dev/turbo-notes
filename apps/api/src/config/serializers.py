from typing import Any

from rest_framework import serializers


class StrictSerializer(serializers.Serializer):
    """Reject undeclared request fields instead of silently discarding them."""

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if hasattr(data, "keys"):
            unknown_fields = sorted(set(data.keys()) - set(self.fields))
            if unknown_fields:
                raise serializers.ValidationError(
                    {field: ["Unknown field."] for field in unknown_fields}
                )
        return super().to_internal_value(data)
