/* =====================================================================
   Hệ thống quản lý dự án, chấm công & tính lương - SQL Server
   Chạy file này trong VS Code (extension "SQL Server (mssql)") hoặc SSMS.
   ===================================================================== */
IF DB_ID(N'PmPayroll') IS NULL
    CREATE DATABASE PmPayroll COLLATE Vietnamese_CI_AS;
GO
USE PmPayroll;
GO

/* ---------- Người dùng & phân quyền ---------- */
CREATE TABLE users (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    email         NVARCHAR(200)  NOT NULL UNIQUE,
    full_name     NVARCHAR(200)  NOT NULL,
    password_hash NVARCHAR(200)  NOT NULL,
    role          VARCHAR(20)    NOT NULL CHECK (role IN ('admin','pm','employee','accountant')),
    hourly_rate   DECIMAL(18,0)  NOT NULL DEFAULT 0,          -- VND / giờ
    is_active     BIT            NOT NULL DEFAULT 1,
    created_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

/* ---------- Dự án, gói việc, công việc, phân công ---------- */
CREATE TABLE projects (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    code        NVARCHAR(30)   NOT NULL UNIQUE,
    name        NVARCHAR(200)  NOT NULL,
    description NVARCHAR(1000) NULL,
    manager_id  INT            NOT NULL REFERENCES users(id),
    status      VARCHAR(20)    NOT NULL DEFAULT 'active' CHECK (status IN ('planning','active','done','archived')),
    start_date  DATE           NULL,
    end_date    DATE           NULL,
    budget      DECIMAL(18,0)  NULL,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE work_packages (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    project_id INT           NOT NULL REFERENCES projects(id),
    name       NVARCHAR(200) NOT NULL,
    sort_order INT           NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT            NOT NULL REFERENCES projects(id),
    work_package_id INT            NULL REFERENCES work_packages(id),
    title           NVARCHAR(300)  NOT NULL,
    description     NVARCHAR(2000) NULL,
    status          VARCHAR(10)    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
    priority        TINYINT        NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1 cao, 3 thấp
    estimate_hours  DECIMAL(9,2)   NOT NULL DEFAULT 0,
    due_date        DATE           NULL,
    completed_at    DATETIME2      NULL,
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE assignments (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id),
    CONSTRAINT uq_assignment UNIQUE (task_id, user_id)
);

/* ---------- Timesheet (theo tuần, gồm nhiều dòng theo ngày) ---------- */
CREATE TABLE timesheets (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NOT NULL REFERENCES users(id),
    week_start  DATE          NOT NULL,                       -- luôn là thứ Hai
    status      VARCHAR(12)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
    submitted_at DATETIME2    NULL,
    reviewed_by INT           NULL REFERENCES users(id),
    reviewed_at DATETIME2     NULL,
    review_note NVARCHAR(500) NULL,
    CONSTRAINT uq_timesheet_week UNIQUE (user_id, week_start)
);

/* Giờ lưu dưới dạng "phút trong ngày" (0-1440) đã làm tròn đến phút gần nhất
   ngay lúc chấm công -> không bị sai số dấu phẩy động khi tính lương. */
CREATE TABLE timesheet_entries (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    timesheet_id INT          NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    work_date    DATE         NOT NULL,
    project_id   INT          NOT NULL REFERENCES projects(id),
    task_id      INT          NULL REFERENCES tasks(id),
    start_min    SMALLINT     NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
    end_min      SMALLINT     NULL,                           -- NULL = đã check-in, chưa check-out
    minutes AS (end_min - start_min) PERSISTED,
    note         NVARCHAR(300) NULL,
    CONSTRAINT ck_entry_range CHECK (end_min IS NULL OR (end_min > start_min AND end_min <= 1440))
);
CREATE INDEX ix_entries_date ON timesheet_entries(work_date);
CREATE INDEX ix_entries_ts   ON timesheet_entries(timesheet_id);
CREATE INDEX ix_timesheets_status ON timesheets(status);

/* ---------- Nghỉ phép ---------- */
CREATE TABLE leaves (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NOT NULL REFERENCES users(id),
    leave_type  VARCHAR(10)   NOT NULL CHECK (leave_type IN ('annual','unpaid')),  -- annual: hưởng lương
    start_date  DATE          NOT NULL,
    end_date    DATE          NOT NULL,
    hours       DECIMAL(6,2)  NOT NULL CHECK (hours > 0),
    reason      NVARCHAR(300) NULL,
    status      VARCHAR(10)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_by INT           NULL REFERENCES users(id),
    reviewed_at DATETIME2     NULL,
    created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

/* ---------- Chính sách lương, kỳ lương, phiếu lương ---------- */
CREATE TABLE payroll_policies (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    name                  NVARCHAR(100) NOT NULL,
    daily_threshold_min   INT           NOT NULL DEFAULT 480,     -- vượt 8h/ngày mới tính OT
    ot_multiplier         DECIMAL(4,2)  NOT NULL DEFAULT 2.00,    -- 200%, một mức duy nhất
    night_start_min       INT           NOT NULL DEFAULT 1320,    -- 22:00
    night_end_min         INT           NOT NULL DEFAULT 360,     -- 06:00
    night_extra_rate      DECIMAL(4,2)  NOT NULL DEFAULT 0.30,    -- phụ cấp đêm +30%
    insurance_rate        DECIMAL(5,4)  NOT NULL DEFAULT 0.1050,  -- BHXH+BHYT+BHTN phần NLĐ
    is_active             BIT           NOT NULL DEFAULT 1,
    created_at            DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE payroll_runs (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    period_year  SMALLINT    NOT NULL,
    period_month TINYINT     NOT NULL CHECK (period_month BETWEEN 1 AND 12),   -- kỳ lương theo tháng
    policy_id    INT         NOT NULL REFERENCES payroll_policies(id),
    status       VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
    created_by   INT         NOT NULL REFERENCES users(id),
    created_at   DATETIME2   NOT NULL DEFAULT SYSUTCDATETIME(),
    finalized_at DATETIME2   NULL,
    CONSTRAINT uq_run_period UNIQUE (period_year, period_month)
);

CREATE TABLE payslips (
    id                   INT IDENTITY(1,1) PRIMARY KEY,
    run_id               INT           NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    user_id              INT           NOT NULL REFERENCES users(id),
    hourly_rate          DECIMAL(18,0) NOT NULL,
    regular_minutes      INT           NOT NULL DEFAULT 0,
    ot_minutes           INT           NOT NULL DEFAULT 0,
    night_minutes        INT           NOT NULL DEFAULT 0,
    leave_minutes        INT           NOT NULL DEFAULT 0,
    regular_pay          DECIMAL(18,0) NOT NULL DEFAULT 0,
    ot_pay               DECIMAL(18,0) NOT NULL DEFAULT 0,
    night_pay            DECIMAL(18,0) NOT NULL DEFAULT 0,
    leave_pay            DECIMAL(18,0) NOT NULL DEFAULT 0,
    gross_pay            DECIMAL(18,0) NOT NULL DEFAULT 0,
    insurance_deduction  DECIMAL(18,0) NOT NULL DEFAULT 0,
    other_deduction      DECIMAL(18,0) NOT NULL DEFAULT 0,
    deduction_note       NVARCHAR(300) NULL,
    net_pay              DECIMAL(18,0) NOT NULL DEFAULT 0,
    CONSTRAINT uq_payslip UNIQUE (run_id, user_id)
);
GO

/* Chính sách mặc định (có thể sửa trong giao diện Bảng lương -> Chính sách) */
INSERT INTO payroll_policies (name) VALUES (N'Chính sách mặc định');
GO
