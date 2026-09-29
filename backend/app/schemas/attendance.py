from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.attendance import AttendanceStatus, LeaveStatus, LeaveType
from app.models.resources import Department
from app.schemas.common import clean_str

# Kunlik jadvaldagi hisoblangan holat: yozuv holati + "kechikdi", "hozir ishda", "belgilanmagan"
DayState = Literal["PRESENT", "LATE", "ABSENT", "LEAVE", "SICK", "VACATION", "NOT_MARKED"]


class _Clean(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return clean_str(v) if isinstance(v, str) else v


class EmployeeBrief(BaseModel):
    id: int
    employee_code: str
    full_name: str
    phone: str | None
    position: str | None
    department: Department
    shift_name: str | None = None
    shift_start: time | None = None
    shift_end: time | None = None


class AttendanceRecordOut(BaseModel):
    id: int
    work_date: date
    status: AttendanceStatus
    check_in: time | None
    check_out: time | None
    late_minutes: int
    worked_minutes: int | None
    note: str | None
    leave_request_id: int | None


class LeaveBrief(BaseModel):
    id: int
    leave_type: LeaveType
    status: LeaveStatus
    start_time: time | None
    end_time: time | None
    reason: str


class DailyRow(BaseModel):
    employee: EmployeeBrief
    record: AttendanceRecordOut | None
    state: DayState
    # Keldi, lekin hali ketmadi (faqat bugungi kun uchun)
    at_work: bool = False
    # Shu kunga tegishli javob so'rovi (kutilayotgan yoki tasdiqlangan, soatbay ham)
    leave: LeaveBrief | None = None


class DailySummary(BaseModel):
    total: int = 0
    present: int = 0
    late: int = 0
    at_work: int = 0
    absent: int = 0
    on_leave: int = 0
    sick: int = 0
    not_marked: int = 0
    worked_minutes: int = 0


class DailyBoard(BaseModel):
    date: date
    is_today: bool
    now: time | None
    rows: list[DailyRow]
    summary: DailySummary


class CheckIn(BaseModel):
    employee_id: int
    work_date: date | None = None  # bo'sh — bugun
    at: time | None = None  # bo'sh — hozir (zavod vaqti)
    note: str | None = Field(default=None, max_length=300)


class CheckOut(BaseModel):
    employee_id: int
    work_date: date | None = None
    at: time | None = None


class AttendanceUpsert(_Clean):
    """Kunlik yozuvni qo'lda kiritish/tuzatish (masalan "kelmadi", "kasal" yoki vaqtni to'g'rilash)."""

    employee_id: int
    work_date: date
    status: AttendanceStatus
    check_in: time | None = None
    check_out: time | None = None
    note: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _times(self):
        if self.status != AttendanceStatus.PRESENT:
            self.check_in = self.check_out = None
        elif self.check_in is None:
            raise ValueError("Kelgan vaqtini kiriting")
        return self


class EmployeeMonthRow(BaseModel):
    employee: EmployeeBrief
    present_days: int = 0
    late_days: int = 0
    late_minutes: int = 0
    absent_days: int = 0
    leave_days: int = 0
    sick_days: int = 0
    vacation_days: int = 0
    worked_minutes: int = 0


class MonthlyReport(BaseModel):
    month: str  # YYYY-MM
    rows: list[EmployeeMonthRow]


class EmployeeMonthDetail(BaseModel):
    employee: EmployeeBrief
    month: str
    days: list[AttendanceRecordOut]
    leaves: list["LeaveOut"]
    totals: EmployeeMonthRow


# ---------- javob so'rovlari ----------


class LeaveCreate(_Clean):
    employee_id: int
    leave_type: LeaveType = LeaveType.PERSONAL
    start_date: date
    end_date: date | None = None  # bo'sh — bir kunlik
    start_time: time | None = None
    end_time: time | None = None
    reason: str = Field(min_length=2, max_length=500)
    # Rahbar o'zi kiritayotgan bo'lsa darhol tasdiqlash mumkin
    approve: bool = False

    @model_validator(mode="after")
    def _range(self):
        if self.end_date is None:
            self.end_date = self.start_date
        if self.end_date < self.start_date:
            raise ValueError("Tugash sanasi boshlanishdan oldin bo'lmasin")
        if (self.end_date - self.start_date).days > 60:
            raise ValueError("Bir so'rov 60 kundan oshmasin")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Soatbay javob uchun ikkala vaqtni kiriting")
        if self.start_time is not None:
            if self.end_date != self.start_date:
                raise ValueError("Soatbay javob faqat bir kun uchun")
            if self.end_time <= self.start_time:
                raise ValueError("Tugash vaqti boshlanishdan keyin bo'lsin")
        return self


class LeaveDecision(_Clean):
    note: str | None = Field(default=None, max_length=300)


class LeaveOut(BaseModel):
    id: int
    employee: EmployeeBrief
    leave_type: LeaveType
    start_date: date
    end_date: date
    start_time: time | None
    end_time: time | None
    days: int
    reason: str
    status: LeaveStatus
    decided_by_name: str | None
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime


class LeavePage(BaseModel):
    items: list[LeaveOut]
    total: int
    pending: int


EmployeeMonthDetail.model_rebuild()
