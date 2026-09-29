"""Davomat: kunlik kelish/ketish, qo'lda tuzatish, oylik hisobot va javob (ruxsat) so'rovlari."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.attendance import LeaveStatus
from app.models.resources import Department
from app.schemas.attendance import (
    AttendanceRecordOut,
    AttendanceUpsert,
    CheckIn,
    CheckOut,
    DailyBoard,
    EmployeeMonthDetail,
    LeaveCreate,
    LeaveDecision,
    LeaveOut,
    LeavePage,
    MonthlyReport,
)
from app.services import attendance_service as svc

router = APIRouter(tags=["Attendance: davomat va javob so'rovlari"])
view = require_roles(*svc.ATTENDANCE_VIEW_ROLES)
edit = require_roles(*svc.ATTENDANCE_EDITOR_ROLES)
approve = require_roles(*svc.LEAVE_APPROVER_ROLES)

StateFilter = Literal["PRESENT", "LATE", "AT_WORK", "ABSENT", "LEAVE", "SICK", "VACATION", "NOT_MARKED"]


@router.get("/attendance/daily", response_model=DailyBoard)
def daily(
    day: date | None = None,
    search: str | None = None,
    department: Department | None = None,
    shift_id: int | None = None,
    state: StateFilter | None = None,
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(view),
):
    return svc.daily_board(db, actor, day=day, search=search, department=department, shift_id=shift_id, state=state, factory_id=factory_id)


@router.post("/attendance/check-in", response_model=AttendanceRecordOut)
def check_in(data: CheckIn, db: Session = Depends(get_db), actor: User = Depends(edit)):
    return svc.check_in(db, actor, data)


@router.post("/attendance/check-out", response_model=AttendanceRecordOut)
def check_out(data: CheckOut, db: Session = Depends(get_db), actor: User = Depends(edit)):
    return svc.check_out(db, actor, data)


@router.put("/attendance", response_model=AttendanceRecordOut)
def upsert(data: AttendanceUpsert, db: Session = Depends(get_db), actor: User = Depends(edit)):
    return svc.upsert(db, actor, data)


@router.delete("/attendance/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(record_id: int, db: Session = Depends(get_db), actor: User = Depends(edit)):
    svc.delete_record(db, actor, record_id)


@router.get("/attendance/monthly", response_model=MonthlyReport)
def monthly(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    search: str | None = None,
    department: Department | None = None,
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(view),
):
    return svc.monthly_report(db, actor, month=month, search=search, department=department, factory_id=factory_id)


@router.get("/attendance/employees/{employee_id}", response_model=EmployeeMonthDetail)
def employee_month(
    employee_id: int,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    actor: User = Depends(view),
):
    return svc.employee_month(db, actor, employee_id, month)


@router.get("/leave-requests", response_model=LeavePage)
def list_leaves(
    status_: LeaveStatus | None = Query(default=None, alias="status"),
    employee_id: int | None = None,
    search: str | None = None,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(view),
):
    return svc.list_leaves(db, actor, status_=status_, employee_id=employee_id, search=search, factory_id=factory_id, offset=offset, limit=limit)


@router.post("/leave-requests", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
def create_leave(data: LeaveCreate, db: Session = Depends(get_db), actor: User = Depends(edit)):
    return svc.create_leave(db, actor, data)


@router.post("/leave-requests/{leave_id}/approve", response_model=LeaveOut)
def approve_leave(leave_id: int, data: LeaveDecision | None = None, db: Session = Depends(get_db), actor: User = Depends(approve)):
    return svc.approve_leave(db, actor, leave_id, data or LeaveDecision())


@router.post("/leave-requests/{leave_id}/reject", response_model=LeaveOut)
def reject_leave(leave_id: int, data: LeaveDecision | None = None, db: Session = Depends(get_db), actor: User = Depends(approve)):
    return svc.reject_leave(db, actor, leave_id, data or LeaveDecision())


@router.delete("/leave-requests/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave(leave_id: int, db: Session = Depends(get_db), actor: User = Depends(edit)):
    svc.delete_leave(db, actor, leave_id)
