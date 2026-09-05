"""Demo completeness checks; never repair model output or invent task details."""
from typing import Any

from .models import ValidationIssue


MISSING_VALUES = {'', 'n/a', 'na', 'none', 'null', 'unknown', '-', '—', '未知', '未提供', '未指定', '不詳', '不详', '未定', '待定'}


def reservation_issues(action: dict[str, Any] | None) -> list[ValidationIssue]:
    if not action or not (
        action.get('action') == 'RESTAURANT_RESERVATION'
        or action.get('tool') == 'restaurant_reservation'
    ):
        return []
    arguments = action.get('arguments')
    if not isinstance(arguments, dict):
        return []  # The normal action mapper reports malformed argument objects.
    issues = []
    fields = [
        ('restaurant', '餐廳名稱'),
        ('number' if 'number' in arguments else 'target_number', '餐廳電話'),
        ('time', '訂位時間'),
        ('party_size', '用餐人數'),
    ]
    for field, label in fields:
        value = arguments.get(field)
        missing = value is None or isinstance(value, str) and value.strip().casefold() in MISSING_VALUES
        key = 'number' if field == 'target_number' else field
        if missing:
            message = f'提議中缺少{label}。'
            kind = 'missing'
        elif field == 'party_size' and (type(value) is not int or value < 1):
            message = '用餐人數必須為大於零的整數。'
            kind = 'invalid'
        elif field != 'party_size' and not isinstance(value, str):
            message = f'{label}必須為文字。'
            kind = 'invalid'
        else:
            continue
        issues.append(ValidationIssue(argument=f'restaurant_reservation.{key}', kind=kind, message=message))
    return issues
